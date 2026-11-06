import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler';
import { verifyOwnerSession } from '../middleware/verifyOwnerSession';
import { verifyToken } from '../middleware/verifyToken';
import { CodeMutationHistoryModel } from '../models/CodeMutationHistory';
import { evaluatePermission } from '../services/permissionEngine';
import { digestPatch, extractChangedPaths, sandboxExecutor } from '../services/sandboxExecutor';

const mutationSchema = z.object({
  patch: z.string().min(1).max(256_000),
  baseCommit: z.string().regex(/^[a-f\d]{7,64}$/i),
}).strict();

export const aiMutationsV1Router = Router();
aiMutationsV1Router.use(verifyToken);

aiMutationsV1Router.post('/', verifyOwnerSession('code:mutate'), async (request, response) => {
  const parsed = mutationSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ success: false, error: 'Mutation requires a valid patch and base commit.' });

  const tenantId = new Types.ObjectId(request.auth!.userId);
  const mutationId = randomUUID();
  const changedPaths = extractChangedPaths(parsed.data.patch);
  const ownerSessionToken = request.get('x-owner-session-token');
  const evaluation = await evaluatePermission({
    action: 'code_mutation',
    actorId: request.auth!.userId,
    tenantId,
    ...(ownerSessionToken ? { ownerSessionToken } : {}),
  });
  if (evaluation.decision !== 'allowed') {
    throw new HttpError(403, evaluation.explanation, 'MUTATION_NOT_AUTHORIZED');
  }

  const checks = await sandboxExecutor.checkPatch(parsed.data.patch);
  const mutation = await CodeMutationHistoryModel.create({
    mutationId,
    tenantId,
    requestedBy: tenantId,
    baseCommit: parsed.data.baseCommit,
    branchName: `owner-mutation/${mutationId}`,
    patchDigest: digestPatch(parsed.data.patch),
    changedPaths,
    checks,
    approval: { state: 'pending' },
    deploymentState: 'not_deployed',
  });

  return response.status(201).json({
    success: true,
    data: {
      id: mutation.mutationId,
      branchName: mutation.branchName,
      patchDigest: mutation.patchDigest,
      changedPaths: mutation.changedPaths,
      checks: mutation.checks,
      approval: mutation.approval.state,
      deploymentState: mutation.deploymentState,
    },
  });
});

aiMutationsV1Router.get('/', async (request, response) => {
  const tenantId = new Types.ObjectId(request.auth!.userId);
  const rows = await CodeMutationHistoryModel.find({ tenantId, requestedBy: tenantId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('mutationId branchName patchDigest changedPaths checks approval deploymentState createdAt')
    .lean();
  return response.status(200).json({ success: true, data: rows });
});

aiMutationsV1Router.get('/:id', async (request, response) => {
  const tenantId = new Types.ObjectId(request.auth!.userId);
  const mutation = await CodeMutationHistoryModel.findOne({
    mutationId: request.params.id,
    tenantId,
    requestedBy: tenantId,
  }).lean();
  if (!mutation) throw new HttpError(404, 'Mutation was not found in this tenant.', 'MUTATION_NOT_FOUND');
  return response.status(200).json({
    success: true,
    data: {
      id: mutation.mutationId,
      branchName: mutation.branchName,
      patchDigest: mutation.patchDigest,
      changedPaths: mutation.changedPaths,
      checks: mutation.checks,
      approval: mutation.approval,
      deploymentState: mutation.deploymentState,
      createdAt: mutation.createdAt.toISOString(),
    },
  });
});
