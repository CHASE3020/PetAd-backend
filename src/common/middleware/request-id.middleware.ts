import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Generates (or forwards) an `X-Request-Id` for every request.
 *
 * The id is attached to `request.requestId` (read by the global exception
 * filter and the logging interceptor) and echoed back in the
 * `X-Request-Id` response header so clients can correlate calls with logs.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ??
      crypto.randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
