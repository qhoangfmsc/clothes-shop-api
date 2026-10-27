import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** Probe của nền tảng gọi liên tục; ghi vào log chỉ làm nhiễu */
const SKIPPED_PATHS = new Set(['/', '/health']);

export interface RequestLogSource {
  method: string;
  originalUrl: string;
  ip?: string;
  headers: Record<string, unknown>;
  route?: { path?: string };
  user?: { id?: string };
}

export interface RequestLogEntry {
  event: 'request';
  requestId: string | null;
  method: string;
  path: string;
  route: string | null;
  status: number;
  durationMs: number;
  ip: string | null;
  userId: string | null;
}

/** Hàm thuần dựng dòng log: chỉ lấy trường cố định, bỏ query, không bao giờ đọc body hay header Authorization */
export function buildRequestLog(req: RequestLogSource, status: number, durationMs: number): RequestLogEntry {
  const requestId = req.headers['x-request-id'];
  return {
    event: 'request',
    requestId: typeof requestId === 'string' ? requestId : null,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    route: req.route?.path ?? null,
    status,
    durationMs,
    ip: req.ip ?? null,
    userId: req.user?.id ?? null,
  };
}

/** Structured logging: một dòng JSON mỗi request khi xong (docs/specs/common/0018) */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const entry = buildRequestLog(
        req as unknown as RequestLogSource,
        res.statusCode,
        Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
      );
      if (SKIPPED_PATHS.has(entry.path)) return;
      if (entry.status >= 500) this.logger.error(entry);
      else if (entry.status >= 400) this.logger.warn(entry);
      else this.logger.log(entry);
    });
    next();
  }
}
