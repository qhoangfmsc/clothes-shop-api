/** Secret JWT dùng khi chưa cấu hình `JWT_SECRET` (chỉ cho dev); production bị `validateEnv` từ chối nếu còn dùng giá trị này */
export const DEFAULT_JWT_SECRET = 'dev-secret-change-me';
