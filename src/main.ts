import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { configureApp } from './core/app.setup';
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

  // Body parser (rawBody cho webhook), ValidationPipe, exception filter — dùng chung với flow test
  configureApp(app);

  app.enableShutdownHooks();

  await setupSwagger(app);
  await app.listen(process.env.PORT || 7001);
}

void bootstrap();
