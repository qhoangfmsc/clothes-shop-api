import { configureApp } from '@core/app.setup';
import { type INestApplication, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { MainModule } from '../../src/main.module';
import { truncateAll } from './db';

export interface TestApp {
  app: INestApplication;
  api: ReturnType<typeof request>;
  dataSource: DataSource;
  jwt: JwtService;
  close: () => Promise<void>;
}

/** Boot `MainModule` thật với cấu hình như production. */
export async function createTestApp(): Promise<TestApp> {
  Logger.overrideLogger(['error', 'warn']);

  const moduleRef = await Test.createTestingModule({ imports: [MainModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  // listen một lần: supertest không tự listen/close mỗi request (dễ đua khi gửi hàng nghìn request)
  await app.listen(0, '127.0.0.1');

  const dataSource = app.get(DataSource);
  // mỗi file flow bắt đầu từ DB trống, không phụ thuộc file chạy trước
  await truncateAll(dataSource);

  return {
    app,
    api: request(app.getHttpServer()),
    dataSource,
    jwt: app.get(JwtService),
    close: () => app.close(),
  };
}
