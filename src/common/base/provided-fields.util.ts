/** Chỉ giữ field client thực sự gửi: bỏ `undefined`, và `null` trừ field cố ý nhận null (khớp ngữ nghĩa `@IsOptional()`: null = không gửi). */
export function pickProvided<T extends object>(dto: T, nullable: readonly (keyof T)[] = []): Partial<T> {
  return Object.fromEntries(
    Object.entries(dto).filter(([key, value]) => value !== undefined && (value !== null || nullable.includes(key as keyof T))),
  ) as Partial<T>;
}
