/** Đánh giá có/không có ảnh (`reviews.images` là mảng jsonb) */
export const HAS_IMAGES_SQL = 'jsonb_array_length(r.images) > 0';
export const NO_IMAGES_SQL = 'jsonb_array_length(r.images) = 0';
