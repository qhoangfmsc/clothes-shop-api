import type { EntityManager, EntityTarget, FindOneOptions, FindOptionsWhere, ObjectLiteral } from 'typeorm';

type LockExtra<T> = Pick<FindOneOptions<T>, 'select' | 'order'>;

/** Khoá ghi một dòng (`SELECT … FOR UPDATE`) trong transaction của `manager`; nơi duy nhất chọn chiến lược khoá. Thứ tự khoá: `Order` trước. */
export function findLocked<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  where: FindOptionsWhere<T>,
  extra: LockExtra<T> = {},
): Promise<T | null> {
  return manager.findOne(entity, { ...extra, where, lock: { mode: 'pessimistic_write' } });
}
