import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
@Catch()
export class Errors implements ExceptionFilter {
 private readonly logger = new Logger('HTTP');
 catch(error: unknown, host: ArgumentsHost) {
  const ctx = host.switchToHttp(); const req = ctx.getRequest<Request>(); const res = ctx.getResponse<Response>();
  const status = error instanceof HttpException ? error.getStatus() : 500;
  const body = error instanceof HttpException ? error.getResponse() : null;
  const message = typeof body === 'string' ? body : body && typeof body === 'object' && 'message' in body ? body.message : 'Не удалось выполнить запрос';
  if (status >= 500) this.logger.error(JSON.stringify({ requestId: res.getHeader('X-Request-Id'), method: req.method, path: req.path, errorType: error instanceof Error ? error.name : 'UnknownError' }));
  res.status(status).json({ error: { code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message, requestId: res.getHeader('X-Request-Id') } });
 }
}
