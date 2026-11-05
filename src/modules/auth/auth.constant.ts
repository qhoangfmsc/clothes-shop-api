/** Loại token — claim `type` trong payload để access và refresh không dùng lẫn được */
export type JwtTokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: JwtTokenType;
}
