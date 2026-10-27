import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RequestLogMiddleware } from './common/middleware/request-log.middleware';
import { configureApp } from './core/app.setup';
import { setupSwagger } from './core/swagger/swagger.config';
import { MainModule } from './main.module';

const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = await NestFactory.create(MainModule, {
    // Production: một dòng JSON mỗi sự kiện để nền tảng lọc/nối theo requestId; dev: text dễ đọc, đủ mức
    logger: isProduction
      ? new ConsoleLogger({ json: true, logLevels: ['log', 'warn', 'error'] })
      : ['log', 'error', 'warn', 'debug', 'verbose'],
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    },
  });

  // Security
  app.use(helmet());
  app.use(new RequestIdMiddleware().use);
  const requestLog = new RequestLogMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) => requestLog.use(req, res, next));

  // Body parser (rawBody cho webhook), ValidationPipe, exception filter — dùng chung với flow test
  configureApp(app);

  app.enableShutdownHooks();

  await setupSwagger(app);
  await app.listen(process.env.PORT || 7001);
}

void bootstrap();
