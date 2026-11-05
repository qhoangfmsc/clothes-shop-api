import { throwAppError } from '@common/exceptions/app.exception';
import type { ObjectLiteral, Repository } from 'typeorm';

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_NOT_NULL_VIOLATION = '23502';
export const PG_CHECK_VIOLATION = '23514';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

export interface DbError {
  code: string;
  constraint?: string;
  column?: string;
}

/** Đọc SQLSTATE, tên constraint và cột từ lỗi của `pg` (lỗi TypeORM bọc trong `driverError`); `null` nếu không phải lỗi DB */
export function dbError(err: unknown): DbError | null {
  const source = (err as { driverError?: unknown } | null)?.driverError ?? err;
  const { code, constraint, column } = (source ?? {}) as Partial<DbError>;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? { code, constraint, column } : null;
}

export const isDbError = (err: unknown, code: string, constraint?: string) => {
  const info = dbError(err);
  return info?.code === code && (constraint === undefined || info.constraint === constraint);
};

/** Vi phạm ràng buộc của `constraint`? */
export const isUniqueViolation = (err: unknown, constraint?: string) => isDbError(err, PG_UNIQUE_VIOLATION, constraint);

/**
 * Vi phạm UNIQUE/CHECK của một constraint có trong bảng ánh xạ → ném mã lỗi nghiệp vụ tương ứng; không thì trả lại để caller ném lại lỗi gốc.
 * Dùng thay cho "kiểm tra rồi mới ghi" khi hai request đồng thời có thể cùng qua bước kiểm tra.
 */
export function throwOnConstraint(err: unknown, byConstraint: Record<string, number>, status?: number): void {
  const info = dbError(err);
  const errorCode = info?.constraint ? byConstraint[info.constraint] : undefined;
  if (errorCode !== undefined && (info?.code === PG_UNIQUE_VIOLATION || info?.code === PG_CHECK_VIOLATION))
    throwAppError(errorCode, undefined, status);
}

/** `repo.save(entity)`; vi phạm constraint có trong bảng ánh xạ → mã lỗi nghiệp vụ, lỗi khác ném lại nguyên văn */
export async function saveOrThrowOnConstraint<T extends ObjectLiteral>(
  repo: Repository<T>,
  entity: T,
  byConstraint: Record<string, number>,
): Promise<T> {
  try {
    return await repo.save(entity);
  } catch (err) {
    throwOnConstraint(err, byConstraint);
    throw err;
  }
}
