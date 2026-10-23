import { setTimeout as sleep } from 'node:timers/promises';
import type { DataSource, QueryRunner } from 'typeorm';

/**
 * Giữ khoá `FOR UPDATE` trên một dòng từ một kết nối riêng, gửi request, rồi đổi dòng đó trước khi nhả khoá.
 * Request tôn trọng khoá sẽ chờ rồi thấy dữ liệu mới; request bỏ khoá làm việc trên dữ liệu cũ và ghi đè. Tất định, không cần cuộc đua.
 */
export async function requestWhileRowLocked<R>(
  dataSource: DataSource,
  row: { table: string; id: string },
  request: () => PromiseLike<R>,
  changeWhileLocked: (runner: QueryRunner) => Promise<unknown>,
  settleMs = 300,
): Promise<R> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query(`SELECT 1 FROM "${row.table}" WHERE id = $1 FOR UPDATE`, [row.id]);
    const pending = Promise.resolve(request());
    await sleep(settleMs); // đủ để request chạy tới chỗ khoá (nếu có) hoặc xong hẳn (nếu không khoá)
    await changeWhileLocked(runner);
    await runner.commitTransaction();
    return await pending;
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

/** Giữ advisory lock theo transaction (`pg_advisory_xact_lock(hashtext(key))`) từ kết nối riêng, như `requestWhileRowLocked` nhưng cho khoá không gắn với dòng nào. */
export async function requestWhileAdvisoryLocked<R>(
  dataSource: DataSource,
  key: string,
  request: () => PromiseLike<R>,
  changeWhileLocked: (runner: QueryRunner) => Promise<unknown>,
  settleMs = 300,
): Promise<R> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
    const pending = Promise.resolve(request());
    await sleep(settleMs);
    await changeWhileLocked(runner);
    await runner.commitTransaction();
    return await pending;
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}
