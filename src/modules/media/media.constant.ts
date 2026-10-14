export const MEDIA_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const MEDIA_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const;
export type MediaMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

/** Độ dài prefix ngẫu nhiên (hex) đặt trước tên file trong storage để tránh trùng tên */
export const MEDIA_KEY_PREFIX_LENGTH = 12;

/**
 * Mục đích của file (`media_files.purpose`)
 * - LIBRARY: thư viện ảnh do admin upload (list/xoá ở `/api/admin/media`)
 * - REVIEW: ảnh khách upload để đính vào đánh giá (không hiện trong thư viện admin)
 */
export const MEDIA_PURPOSES = ['LIBRARY', 'REVIEW'] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/** Ảnh đánh giá của khách: tối đa 5 MB mỗi ảnh, 30 ảnh mỗi user trong 24 giờ */
export const REVIEW_IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const REVIEW_UPLOAD_LIMIT_PER_DAY = 30;
