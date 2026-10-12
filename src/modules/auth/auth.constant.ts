/** Secret dùng khi chưa cấu hình JWT_SECRET (chỉ cho môi trường dev) */
export const DEFAULT_JWT_SECRET = 'dev-secret-change-me';

/** Loại token — claim `type` trong payload để access và refresh không dùng lẫn được */
export type JwtTokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: JwtTokenType;
}
