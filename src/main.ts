import type { IncomingMessage } from 'node:http';
import { type RawBodyRequest, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AllExceptionFilter } from './common/filter/exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { setupSwagger } from './core/swagger/swagger.config';
import { MainModule } from './main.module';

async function bootstrap() {
  const app = await NestFactory.create(MainModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
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

  // Webhook SePay ký trên bytes gốc của body → giữ lại `req.rawBody` cho route webhook
  app.use(
    json({
      limit: '5mb',
      verify: (req: RawBodyRequest<IncomingMessage>, _res, buf) => {
        if (req.url?.startsWith('/api/webhooks/')) req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  // Strict validation: strip unknown fields, reject them
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionFilter());

  app.enableShutdownHooks();

  await setupSwagger(app);
  await app.listen(process.env.PORT || 7001);
}

void bootstrap();
