import type { IncomingMessage } from 'node:http';
import { type INestApplication, type RawBodyRequest, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AllExceptionFilter } from '../common/filter/exception.filter';

/**
 * Cấu hình HTTP dùng chung cho app thật (`main.ts`) và flow test (`test/support/test-app.ts`):
 * một nguồn duy nhất để test chạy đúng pipeline production. Gọi TRƯỚC `app.init()` / `app.listen()`.
 */
export function configureApp(app: INestApplication): void {
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
}
