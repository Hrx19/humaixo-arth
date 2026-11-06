import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code = 'HTTP_ERROR') {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

type ErrorRecord = Record<string, unknown>;

function toErrorRecord(error: unknown): ErrorRecord {
  if (typeof error === 'object' && error !== null) {
    return error as ErrorRecord;
  }

  return {};
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new HttpError(
      404,
      `Route ${request.method} ${request.path} was not found.`,
      'NOT_FOUND',
    ),
  );
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  next,
): void => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const errorRecord = toErrorRecord(error);
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected server error occurred.';
  let validationIssues: Array<{ path: string; message: string }> | undefined;

  if (error instanceof HttpError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed.';
    validationIssues = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (errorRecord.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'The request body contains invalid JSON.';
  } else if (errorRecord.name === 'MulterError' && errorRecord.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    code = 'UPLOAD_TOO_LARGE';
    message = 'Statement files must be 10 MB or smaller.';
  } else if (errorRecord.name === 'MulterError') {
    statusCode = 400;
    code = 'INVALID_UPLOAD';
    message = 'The uploaded file could not be accepted.';
  } else if (errorRecord.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'A record with the supplied unique value already exists.';
  } else if (errorRecord.name === 'ValidationError') {
    statusCode = 422;
    code = 'DATABASE_VALIDATION_ERROR';
    message = 'The supplied data could not be saved.';
  }

  const logContext = {
    code,
    statusCode,
    method: request.method,
    path: request.path,
    ip: request.ip,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };

  if (statusCode >= 500) {
    logger.error('HTTP request failed.', logContext);
  } else {
    logger.warn('HTTP request rejected.', logContext);
  }

  response.status(statusCode).json({
    success: false,
    error: message,
    code,
    ...(validationIssues ? { details: validationIssues } : {}),
  });
};
