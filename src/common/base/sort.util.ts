export type SortDirection = 'ASC' | 'DESC';

/**
 * Chuẩn sort của toàn project: `sort=field` = tăng dần (ASC), `sort=-field` = giảm dần (DESC).
 * Dùng cho `@IsIn(sortValues([...]))` ở DTO để whitelist field được phép sort.
 */
export function sortValues(fields: readonly string[]): string[] {
  return fields.flatMap((field) => [field, `-${field}`]);
}

/**
 * Parse `sort` đã được DTO whitelist; không truyền thì dùng `fallback` (cùng cú pháp, vd '-createdAt').
 */
export function parseSort(sort: string | undefined, fallback: string): { field: string; direction: SortDirection } {
  const value = sort || fallback;
  return value.startsWith('-') ? { field: value.slice(1), direction: 'DESC' } : { field: value, direction: 'ASC' };
}
