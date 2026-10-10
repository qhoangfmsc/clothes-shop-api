export interface MediaFileDto {
  /** Định danh dùng để xoá/tham chiếu lại (= object key trong bucket) */
  id: string;
  name: string;
  mimeType: string;
  /** bytes */
  sizeOriginal: number;
  /** ISO 8601 */
  createdAt: string;
  /** Public URL, truy cập trực tiếp không cần auth */
  url: string;
}
