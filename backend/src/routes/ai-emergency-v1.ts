import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { verifyOwnerSession } from '../middleware/verifyOwnerSession';
import { verifyToken } from '../middleware/verifyToken';
import { AIPermissionLogModel } from '../models/AIPermissionLog';
import { evaluatePermission } from '../services/permissionEngine';
import {
  assertGracefulRestartAvailable,
  flushApplicationCaches,
  requestGracefulServiceRestart,
} from '../services/emergencyControlService';

const emptyBody = (body: unknown): boolean =>
  typeof body === 'object' && body !== null && !Array.isArray(body) && Object.keys(body).length === 0;

export const aiEmergencyV1Router = Router();
aiEmergencyV1Router.use(verifyToken);

aiEmergencyV1Router.get('/status', (_request, response) => {
  const connected = mongoose.connection.readyState === 1;
  return response.status(connected ? 200 : 503).json({
    success: connected,
    data: {
      status: connected ? 'healthy' : 'degraded',
      database: connected ? 'connected' : 'disconnected',
      checkedAt: new Date().toISOString(),
    },
  });
});

aiEmergencyV1Router.post(
  '/cache-flush',
  verifyOwnerSession('emergency:cache_flush'),
  async (request, response) => {
    if (!emptyBody(request.body)) return response.status(400).json({ success: false, error: 'Request body must be empty.' });
    const tenantId = new Types.ObjectId(request.auth!.userId);
    const ownerSessionToken = request.get('x-owner-session-token');
    const evaluation = await evaluatePermission({
      action: 'emergency_cache_flush',
      actorId: request.auth!.userId,
      tenantId,
      ...(ownerSessionToken ? { ownerSessionToken } : {}),
    });

    try {
      const result = await flushApplicationCaches();
      await AIPermissionLogModel.create({
        requestId: randomUUID(),
        actorType: 'owner',
        actorId: request.auth!.userId,
        tenantId,
        action: 'emergency_cache_flush_result',
        tier: 3,
        decision: 'allowed',
        resourceType: 'application-cache',
        ownerSessionId: request.ownerSession!.sessionId,
        executionId: evaluation.requestId,
        result: `Cache flush completed across ${result.providers} provider(s), clearing ${result.clearedEntries} entries.`,
      });
      return response.status(200).json({ success: true, data: result });
    } catch (error) {
      await AIPermissionLogModel.create({
        requestId: randomUUID(),
        actorType: 'owner',
        actorId: request.auth!.userId,
        tenantId,
        action: 'emergency_cache_flush_result',
        tier: 3,
        decision: 'denied',
        resourceType: 'application-cache',
        ownerSessionId: request.ownerSession!.sessionId,
        executionId: evaluation.requestId,
        result: error instanceof Error ? error.message.slice(0, 500) : 'Cache flush failed.',
      });
      throw error;
    }
  },
);

aiEmergencyV1Router.post(
  '/restart-service',
  verifyOwnerSession('emergency:restart_service'),
  async (request, response) => {
    if (!emptyBody(request.body)) return response.status(400).json({ success: false, error: 'Request body must be empty.' });
    const tenantId = new Types.ObjectId(request.auth!.userId);
    const ownerSessionToken = request.get('x-owner-session-token');
    const evaluation = await evaluatePermission({
      action: 'emergency_restart_service',
      actorId: request.auth!.userId,
      tenantId,
      ...(ownerSessionToken ? { ownerSessionToken } : {}),
    });
    assertGracefulRestartAvailable();
    await AIPermissionLogModel.create({
      requestId: randomUUID(),
      actorType: 'owner',
      actorId: request.auth!.userId,
      tenantId,
      action: 'emergency_restart_service_result',
      tier: 3,
      decision: 'allowed',
      resourceType: 'application-service',
      ownerSessionId: request.ownerSession!.sessionId,
      executionId: evaluation.requestId,
      result: 'Graceful restart requested; process manager is expected to restart the service.',
    });

    requestGracefulServiceRestart();
    return response.status(202).json({ success: true, data: { state: 'restart_requested' } });
  },
);
