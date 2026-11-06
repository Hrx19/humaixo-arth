import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';
import { verifyToken } from '../middleware/verifyToken';
import { attachOwnerSessionForAction } from '../middleware/verifyOwnerSession';
import { AIPermissionLogModel } from '../models/AIPermissionLog';
import { AIPermissionProposalModel } from '../models/AIPermissionProposal';
import { evaluatePermission } from '../services/permissionEngine';

const authorizeSchema = z.object({ action: z.string().trim().min(1).max(100) }).strict();
const proposalSchema = z.object({
  action: z.enum(['schema_change', 'settings_change']),
  resourceType: z.string().trim().min(1).max(100),
  summary: z.string().trim().min(5).max(1_000),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const aiActionsV1Router = Router();
aiActionsV1Router.use(verifyToken);

aiActionsV1Router.post('/authorize', attachOwnerSessionForAction, async (request, response) => {
  const parsed = authorizeSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'A valid action name is required.' });
  const tenantId = new Types.ObjectId(request.auth!.userId);
  const ownerSessionToken = request.get('x-owner-session-token');
  const evaluation = await evaluatePermission({
    action: parsed.data.action,
    actorId: request.auth!.userId,
    tenantId,
    ...(ownerSessionToken ? { ownerSessionToken } : {}),
  });
  return response.status(evaluation.decision === 'denied' ? 403 : 200).json({
    success: evaluation.decision !== 'denied',
    data: evaluation,
  });
});

aiActionsV1Router.post('/proposals', async (request, response) => {
  const parsed = proposalSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'Proposal request is invalid.' });
  const payloadSize = Buffer.byteLength(JSON.stringify(parsed.data.payload), 'utf8');
  if (payloadSize > 20_000) return response.status(413).json({ success: false, error: 'Proposal details exceed the allowed size.' });

  const tenantId = new Types.ObjectId(request.auth!.userId);
  const proposalId = randomUUID();
  const evaluation = await evaluatePermission({
    action: parsed.data.action,
    actorId: request.auth!.userId,
    tenantId,
  });
  if (evaluation.decision !== 'approval_required') {
    throw new HttpError(403, 'This action cannot be submitted as a Tier 2 proposal.', 'PROPOSAL_ACTION_NOT_ALLOWED');
  }

  const proposal = await AIPermissionProposalModel.create({
    proposalId,
    tenantId,
    requestedBy: tenantId,
    action: parsed.data.action,
    resourceType: parsed.data.resourceType,
    summary: parsed.data.summary,
    payload: parsed.data.payload,
    state: 'pending',
  });
  return response.status(201).json({
    success: true,
    data: { id: proposal.proposalId, action: proposal.action, summary: proposal.summary, state: proposal.state },
  });
});

aiActionsV1Router.post('/proposals/:id/approve', async (request, response) => {
  const choiceSchema = z.object({ decision: z.enum(['approved', 'rejected']) }).strict();
  const parsed = choiceSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'Decision must be approved or rejected.' });
  if (!Types.ObjectId.isValid(request.auth!.userId) || !env.AI_OWNER_USER_IDS.includes(request.auth!.userId)) {
    throw new HttpError(403, 'Only a configured owner may approve proposals.', 'OWNER_ACCESS_DENIED');
  }

  const tenantId = new Types.ObjectId(request.auth!.userId);
  const proposal = await AIPermissionProposalModel.findOneAndUpdate(
    { proposalId: request.params.id, tenantId, state: 'pending' },
    { $set: { state: parsed.data.decision, decidedBy: tenantId, decidedAt: new Date() } },
    { new: true },
  );
  if (!proposal) throw new HttpError(404, 'Pending proposal was not found in this tenant.', 'PROPOSAL_NOT_FOUND');
  await AIPermissionLogModel.create({
    requestId: randomUUID(),
    actorType: 'owner',
    actorId: request.auth!.userId,
    tenantId,
    action: `proposal_${parsed.data.decision}`,
    tier: 2,
    decision: parsed.data.decision === 'approved' ? 'allowed' : 'denied',
    resourceType: proposal.resourceType,
    result: parsed.data.decision === 'approved' ? 'Human owner approved the proposal; no execution is implied.' : 'Human owner rejected the proposal.',
  });
  return response.status(200).json({
    success: true,
    data: { id: proposal.proposalId, state: proposal.state, executionStarted: false },
  });
});

aiActionsV1Router.get('/audit', async (request, response) => {
  const limit = z.coerce.number().int().min(1).max(100).safeParse(request.query.limit ?? 50);
  if (!limit.success) return response.status(400).json({ success: false, error: 'Audit limit must be between 1 and 100.' });
  const tenantId = new Types.ObjectId(request.auth!.userId);
  const rows = await AIPermissionLogModel.find({ tenantId }).sort({ createdAt: -1 }).limit(limit.data).lean();
  return response.status(200).json({
    success: true,
    data: rows.map((row) => ({
      id: row.requestId,
      action: row.action,
      tier: row.tier,
      decision: row.decision,
      resourceType: row.resourceType,
      result: row.result,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});
