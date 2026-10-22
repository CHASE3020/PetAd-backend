import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes';

/**
 * Base exception for structured, code-driven HTTP errors.
 *
 * The carried payload (`code`, `message`, `details`) is rendered by the
 * global exception filter into the standard error response shape:
 * `{ statusCode, code, message, details?, requestId, timestamp, path }`.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string | object,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(
      { statusCode, code, message, details },
      statusCode,
    );
  }
}

/**
 * Convenience exception for the most common client errors.
 */
export class BadRequestAppException extends AppException {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, details);
  }
}

export class UnauthorizedAppException extends AppException {
  constructor(message: string = 'Unauthorized') {
    super('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenAppException extends AppException {
  constructor(message: string = 'Forbidden') {
    super('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }
}

export class NotFoundAppException extends AppException {
  constructor(message: string = 'Resource not found') {
    super('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
}

export class ConflictAppException extends AppException {
  constructor(message: string, code: ErrorCode = 'CONFLICT', details?: unknown) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}
