import { configureApp } from '@core/app.setup';
import { type INestApplication, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { MainModule } from '../../src/main.module';

export interface TestApp {
  app: INestApplication;
  /** supertest gắn với app đã boot, dùng như `api.get('/api/...')` */
  api: ReturnType<typeof request>;
  dataSource: DataSource;
  jwt: JwtService;
  close: () => Promise<void>;
}

/** Boot `MainModule` thật (guard, pipe, filter, controller, service, DB) với cấu hình giống production qua `configureApp` */
export async function createTestApp(): Promise<TestApp> {
  Logger.overrideLogger(['error', 'warn']);

  const moduleRef = await Test.createTestingModule({ imports: [MainModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    api: request(app.getHttpServer()),
    dataSource: app.get(DataSource),
    jwt: app.get(JwtService),
    close: () => app.close(),
  };
}
