import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import jwt, { TokenExpiredError, type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      userId: string;
    };
  }
}

function unauthorized(
  response: Parameters<RequestHandler>[1],
  message: string,
): void {
  response.status(401).json({ success: false, error: message });
}

export const verifyToken: RequestHandler = (request, response, next) => {
  const authorization = request.get('authorization');
  if (!authorization) {
    unauthorized(response, 'Authentication token is required.');
    return;
  }

  const [scheme, token, ...extraParts] = authorization.trim().split(/\s+/);
  if (
    scheme?.toLowerCase() !== 'bearer' ||
    !token ||
    extraParts.length > 0
  ) {
    unauthorized(response, 'Authorization header must use the Bearer scheme.');
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof payload === 'string' ||
      typeof (payload as JwtPayload).userId !== 'string' ||
      !Types.ObjectId.isValid((payload as JwtPayload).userId as string)
    ) {
      unauthorized(response, 'Authentication token is invalid.');
      return;
    }

    request.auth = { userId: (payload as JwtPayload).userId as string };
    next();
  } catch (error) {
    unauthorized(
      response,
      error instanceof TokenExpiredError
        ? 'Authentication token has expired.'
        : 'Authentication token is invalid.',
    );
  }
};
