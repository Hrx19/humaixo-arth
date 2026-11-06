import type { RequestHandler } from 'express';
import { validateOwnerSession, type OwnerScope } from '../services/masterKeyService';

declare module 'express-serve-static-core' {
  interface Request {
    ownerSession?: { sessionId: string; scopes: string[] };
  }
}

export function verifyOwnerSession(requiredScope: OwnerScope): RequestHandler {
  return (request, response, next) => {
    const ownerToken = request.get('x-owner-session-token');
    const ownerId = request.auth?.userId;
    if (!ownerToken || !ownerId) {
      response.status(403).json({ success: false, error: 'A valid owner session is required.' });
      return;
    }

    void validateOwnerSession(ownerToken, ownerId, requiredScope)
      .then((session) => {
        if (!session) {
          response.status(403).json({
            success: false,
            error: 'Owner session is invalid, expired, revoked, or missing the required scope.',
          });
          return;
        }
        request.ownerSession = session;
        next();
      })
      .catch(next);
  };
}

export const attachOwnerSessionForAction: RequestHandler = (request, _response, next) => {
  const action = typeof request.body?.action === 'string' ? request.body.action : '';
  const scopeByAction: Record<string, OwnerScope> = {
    emergency_cache_flush: 'emergency:cache_flush',
    emergency_restart_service: 'emergency:restart_service',
    code_mutation: 'code:mutate',
  };
  const requiredScope = scopeByAction[action];
  if (!requiredScope) {
    next();
    return;
  }

  const ownerToken = request.get('x-owner-session-token');
  const ownerId = request.auth?.userId;
  if (!ownerToken || !ownerId) {
    next();
    return;
  }

  void validateOwnerSession(ownerToken, ownerId, requiredScope)
    .then((session) => {
      if (session) request.ownerSession = session;
      next();
    })
    .catch(next);
};
