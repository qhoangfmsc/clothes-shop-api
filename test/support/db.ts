import { DataSource } from 'typeorm';
import { assertTestDatabase } from './test-env';

/** Xoá toàn bộ dữ liệu (giữ schema và bảng migration). Dùng ở `afterEach` để mỗi test bắt đầu từ DB trống */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  assertTestDatabase();
  const tables: { tablename: string }[] = await dataSource.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'typeorm_migrations'`,
  );
  if (!tables.length) return;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await dataSource.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
