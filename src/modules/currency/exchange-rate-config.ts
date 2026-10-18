import { throwAppError } from '@common/exceptions/app.exception';
import { ESiteConfigErrorCode } from '@common/exceptions/error-codes';
import { plainToInstance } from 'class-transformer';
import { IsNumber, Max, Min, ValidationError, validateSync } from 'class-validator';

export interface ExchangeRateConfig {
  /** Số VND cho 1 USD — dùng để suy ra mọi giá trị USD trong API */
  vndPerUsd: number;
}

/** Dùng khi chưa có dòng `EXCHANGE_RATE` hoặc giá trị lưu trong DB không hợp lệ */
export const DEFAULT_VND_PER_USD = 25000;

export const MIN_VND_PER_USD = 1;
export const MAX_VND_PER_USD = 1_000_000;

class ExchangeRateConfigDto implements ExchangeRateConfig {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_VND_PER_USD)
  @Max(MAX_VND_PER_USD)
  vndPerUsd: number;
}

const flatten = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => Object.values(error.constraints ?? {}).map((message) => `${error.property}: ${message}`));

export type ParsedExchangeRateConfig = { ok: true; config: ExchangeRateConfig } | { ok: false; errors: string[] };

/** Parse + kiểm tra chuỗi JSON cấu hình tỷ giá. Field lạ bị từ chối. */
export function parseExchangeRateConfig(value: string): ParsedExchangeRateConfig {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return { ok: false, errors: ['value: must be valid JSON'] };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, errors: ['value: must be a JSON object'] };
  }

  const instance = plainToInstance(ExchangeRateConfigDto, json);
  const errors = flatten(validateSync(instance, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: { vndPerUsd: instance.vndPerUsd } };
}

/** Dùng cho upsert admin: trả JSON chuẩn hoá hoặc ném `SITE_CONFIG_VALUE_INVALID` */
export function validateExchangeRateConfigValue(value: string): string {
  const result = parseExchangeRateConfig(value);
  if (!result.ok) {
    throwAppError(ESiteConfigErrorCode.SITE_CONFIG_VALUE_INVALID, `Invalid EXCHANGE_RATE: ${result.errors.join('; ')}`);
  }
  return JSON.stringify(result.config);
}
