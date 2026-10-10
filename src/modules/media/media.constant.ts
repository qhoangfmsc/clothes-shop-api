export const MEDIA_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const MEDIA_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const;
export type MediaMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

/** Độ dài prefix ngẫu nhiên (hex) đặt trước tên file trong storage để tránh trùng tên */
export const MEDIA_KEY_PREFIX_LENGTH = 12;
