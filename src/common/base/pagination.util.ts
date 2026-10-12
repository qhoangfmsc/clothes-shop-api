/** Mặc định phân trang cho MỌI API list (public lẫn admin) */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
/** Số bản ghi tối đa mỗi trang — áp dụng cho MỌI API list */
export const MAX_PAGE_SIZE = 200;

/** Lấy page/limit đã áp mặc định (service có thể nhận query là `{}` khi controller không truyền) */
export function getPaging(query: { page?: number; limit?: number }) {
  return { page: query.page ?? DEFAULT_PAGE, limit: query.limit ?? DEFAULT_PAGE_SIZE };
}

/** Shape chuẩn của mọi API list có phân trang (public lẫn admin) */
export function paginated<T>(data: T[], total: number, page: number, limit: number) {
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}
