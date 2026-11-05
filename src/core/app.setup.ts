import type { IncomingMessage } from 'node:http';
import { type INestApplication, type RawBodyRequest, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AllExceptionFilter } from '../common/filter/exception.filter';

/** Cấu hình HTTP dùng chung cho `main.ts` và flow test; gọi trước `app.init()`. */
export function configureApp(app: INestApplication): void {
  // Sau reverse proxy (Render) `req.ip` phải là IP client, không thì mọi client chung một bộ đếm rate limit; TRUST_PROXY = số tầng proxy tin cậy
  const proxyHops = Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? 1 : 0));
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', Number.isInteger(proxyHops) && proxyHops >= 0 ? proxyHops : 0);

  // Webhook SePay ký trên bytes gốc → giữ `req.rawBody`
  app.use(
    json({
      limit: '5mb',
      verify: (req: RawBodyRequest<IncomingMessage>, _res, buf) => {
        if (req.url?.startsWith('/api/webhooks/')) req.rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  // Field lạ bị loại và từ chối
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionFilter());
}
