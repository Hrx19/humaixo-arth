import type { Request, RequestHandler } from 'express';
import { verifyToken } from './verifyToken';

/**
 * Compatibility shape for route handlers that expect the authenticated ID
 * directly on the request. The canonical verifier also sets request.auth.
 */
export interface AuthRequest extends Request {
  userId?: string;
  auth?: {
    userId: string;
  };
}

/**
 * Uses the shared JWT verifier so all protected endpoints enforce the same
 * Bearer token format, configured secret, expiry, and Mongo ObjectId checks.
 */
export const authenticateToken: RequestHandler = (request, response, next) => {
  verifyToken(request, response, () => {
    const userId = request.auth?.userId;
    if (!userId) {
      response.status(401).json({
        success: false,
        error: 'Authentication token is invalid.',
      });
      return;
    }

    (request as AuthRequest).userId = userId;
    next();
  });
};
