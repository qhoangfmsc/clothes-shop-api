import { DEFAULT_JWT_SECRET } from '../common/constants/security.constant';

const MIN_JWT_SECRET_LENGTH = 32;

const isBlank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
const isPort = (value: unknown) => /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 65535;
const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Kiểm tra env lúc khởi động; production sai là không chạy. Thông báo chỉ nêu tên biến và lý do, không bao giờ in giá trị. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const problems: string[] = [];

  for (const key of ['PORT', 'POSTGRES_PORT']) {
    if (!isBlank(config[key]) && !isPort(config[key])) problems.push(`${key}: phải là số nguyên từ 1 đến 65535`);
  }

  if (config.NODE_ENV === 'production') {
    const secret = config.JWT_SECRET;
    if (isBlank(secret)) problems.push('JWT_SECRET: bắt buộc ở production');
    else if (secret === DEFAULT_JWT_SECRET) problems.push('JWT_SECRET: đang dùng giá trị mặc định của mã nguồn');
    else if ((secret as string).length < MIN_JWT_SECRET_LENGTH) problems.push(`JWT_SECRET: tối thiểu ${MIN_JWT_SECRET_LENGTH} ký tự`);

    for (const key of [
      'POSTGRES_HOST',
      'POSTGRES_USERNAME',
      'POSTGRES_PASSWORD',
      'POSTGRES_DATABASE',
      'GOOGLE_CLIENT_ID',
      'SEPAY_WEBHOOK_SECRET',
      'SEPAY_RECEIVING_ACCOUNT',
    ]) {
      if (isBlank(config[key])) problems.push(`${key}: bắt buộc ở production`);
    }

    if (isBlank(config.CORS_ORIGINS)) problems.push('CORS_ORIGINS: bắt buộc ở production');
    else if (
      !String(config.CORS_ORIGINS)
        .split(',')
        .every((origin) => isHttpUrl(origin.trim()))
    ) {
      problems.push('CORS_ORIGINS: mỗi origin phải là URL http(s) hợp lệ, ngăn cách bằng dấu phẩy');
    }
  }

  if (problems.length) throw new Error(`Cấu hình môi trường không hợp lệ:\n- ${problems.join('\n- ')}`);
  return config;
}
