/** Chuẩn hoá đường dẫn route: bỏ `/` thừa và `/` cuối (trừ route gốc). Không import alias để script ts-node dùng được. */
export function normalizePath(...parts: string[]): string {
  const path = `/${parts.join('/')}`.replace(/\/+/g, '/');
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}
