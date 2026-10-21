import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { truncateAll } from './db';
import { applyTestEnv } from './test-env';

/** Mỗi lần chạy: dựng schema sạch từ migration rồi xoá dữ liệu seed. Dùng import tương đối vì không qua moduleNameMapper. */
export default async function globalSetup(): Promise<void> {
  applyTestEnv();
  await acquireRunLock();

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    username: process.env.POSTGRES_USERNAME,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
    migrations: [`${__dirname}/../../src/migrations/*.ts`],
    migrationsTableName: 'typeorm_migrations',
  });

  await dataSource.initialize();

  try {
    await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.runMigrations();
    // migration có seed: bắt đầu từ DB trống
    await truncateAll(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

// Khoá advisory chặn hai lần chạy cùng DB (nhả khi teardown đóng kết nối)
const RUN_LOCK_KEY = 20_261_021;

async function acquireRunLock(): Promise<void> {
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    user: process.env.POSTGRES_USERNAME,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot connect to the flow-test database (${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}). Run "yarn test:db:up" first, or fix POSTGRES_* in .env.test (then "yarn test:db:down && yarn test:db:up"). ${(error as Error).message}`,
    );
  }
  const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [RUN_LOCK_KEY]);
  if (!rows[0].locked) {
    await client.end();
    throw new Error("Another flow-test run is using this database. Wait for it to finish (two runs would wipe each other's schema).");
  }
  (globalThis as { __flowRunLock?: Client }).__flowRunLock = client;
}
