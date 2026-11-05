import { configureApp } from '@core/app.setup';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { MainModule } from '../../src/main.module';
import { recordRequest, writeRouteTable } from './coverage';
import { truncateAll } from './db';
import { discoverRoutes, routeKey } from './routes';

export interface TestApp {
  app: INestApplication;
  api: ReturnType<typeof request>;
  dataSource: DataSource;
  jwt: JwtService;
  close: () => Promise<void>;
}

/** Boot `MainModule` thật với cấu hình như production. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [MainModule] }).compile();
  const app = moduleRef.createNestApplication();
  // 5xx kỳ vọng (vd storage chưa cấu hình) lặp lại hàng chục lần ở ma trận; đặt FLOW_TEST_LOGS=1 để xem log khi debug
  if (!process.env.FLOW_TEST_LOGS) app.useLogger(false);
  configureApp(app);
  // ghi lại request thật (bỏ qua request thăm dò của ma trận) để đo độ phủ endpoint
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-test-probe']) res.on('finish', () => req.route?.path && recordRequest(req.method, req.route.path, res.statusCode));
    next();
  });
  // listen một lần: supertest không tự listen/close mỗi request (dễ đua khi gửi hàng nghìn request)
  await app.listen(0, '127.0.0.1');

  const dataSource = app.get(DataSource);
  writeRouteTable(discoverRoutes(app).map((route) => ({ key: routeKey(route), isPublic: route.isPublic })));
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
