import type { DataSource } from 'typeorm';

/** Khoá advisory của migration (khác khoá của flow test); mọi instance cùng DB tranh một khoá này */
export const MIGRATION_LOCK_KEY = 20_261_027;

/** Mutual exclusion bằng advisory lock: hai instance khởi động cùng lúc không cùng chạy một migration (docs/specs/common/0016) */
export async function runMigrationsWithLock(dataSource: DataSource): Promise<string[]> {
  if (!dataSource.isInitialized) await dataSource.initialize();
  // Khoá theo phiên nên phải giữ đúng một kết nối cho tới khi nhả
  const lockRunner = dataSource.createQueryRunner();
  await lockRunner.connect();
  try {
    await lockRunner.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      const executed = await dataSource.runMigrations();
      return executed.map((migration) => migration.name);
    } finally {
      await lockRunner.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    await lockRunner.release();
  }
}

if (require.main === module) {
  void (async () => {
    // import trong hàm để file này nhập được từ test mà không nạp `.env` và data-source của máy
    const { default: dataSource } = await import('../data-source');
    try {
      const executed = await runMigrationsWithLock(dataSource);
      console.log(executed.length ? `Migrations applied: ${executed.join(', ')}` : 'No pending migrations');
    } finally {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
