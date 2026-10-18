import { throwAppError } from '@common/exceptions/app.exception';
import { ESiteConfigErrorCode } from '@common/exceptions/error-codes';
import { MAX_MONEY_VND } from '@common/utils/money.util';
import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
  ValidationError,
  validateSync,
} from 'class-validator';

/** Phương thức giao hàng hợp lệ khi checkout — cố định, admin chỉ sửa nội dung/phí chứ không thêm/bớt phương thức */
export const SHIPPING_METHOD_IDS = ['standard', 'express', 'store-pickup'] as const;
export const SHIPPING_METHOD_ICONS = ['truck', 'express', 'store'] as const;

export interface ShippingMethodConfig {
  id: (typeof SHIPPING_METHOD_IDS)[number];
  name: string;
  description: string;
  estimatedDays: string;
  /** Phí ship (VND, số nguyên) */
  priceVnd: number;
  icon: (typeof SHIPPING_METHOD_ICONS)[number];
}

export interface ReturnPolicyConfig {
  /** Số ngày được đổi trả kể từ lúc đơn được giao (orders.delivered_at) */
  days: number;
  description: string;
  conditions: string[];
}

export interface ShippingConfig {
  /** Subtotal (VND) đạt ngưỡng này thì miễn phí ship (mọi phương thức); `null` = không có miễn phí ship */
  freeShippingThresholdVnd: number | null;
  methods: ShippingMethodConfig[];
  returnPolicy: ReturnPolicyConfig;
}

/** Giá trị mặc định: dùng khi chưa có dòng `SHIPPING_CONFIG` hoặc giá trị lưu trong DB không hợp lệ; cũng là giá trị seed của migration */
export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  freeShippingThresholdVnd: 1_500_000,
  methods: [
    {
      id: 'standard',
      name: 'Standard Shipping',
      description: 'Delivered in eco-friendly packaging',
      estimatedDays: '5-7 business days',
      priceVnd: 30_000,
      icon: 'truck',
    },
    {
      id: 'express',
      name: 'Express Shipping',
      description: 'Priority handling and faster delivery',
      estimatedDays: '2-3 business days',
      priceVnd: 50_000,
      icon: 'express',
    },
    {
      id: 'store-pickup',
      name: 'Store Pickup',
      description: 'Pick up at our flagship store',
      estimatedDays: '1-2 business days',
      priceVnd: 0,
      icon: 'store',
    },
  ],
  returnPolicy: {
    days: 30,
    description: 'We accept returns within 30 days of purchase for a full refund.',
    conditions: [
      'Items must be unworn and in original condition',
      'All tags must be attached',
      'Original packaging required',
      'Sale items are final sale',
    ],
  },
};

class ShippingMethodConfigDto implements ShippingMethodConfig {
  @IsIn(SHIPPING_METHOD_IDS)
  id: ShippingMethodConfig['id'];

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(255)
  description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  estimatedDays: string;

  @IsInt()
  @Min(0)
  @Max(MAX_MONEY_VND)
  priceVnd: number;

  @IsIn(SHIPPING_METHOD_ICONS)
  icon: ShippingMethodConfig['icon'];
}

class ReturnPolicyConfigDto implements ReturnPolicyConfig {
  @IsInt()
  @Min(1)
  @Max(365)
  days: number;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(255, { each: true })
  conditions: string[];
}

class ShippingConfigDto {
  // null = tắt miễn phí ship
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_MONEY_VND)
  freeShippingThresholdVnd: number | null;

  @IsArray()
  @ArrayMinSize(SHIPPING_METHOD_IDS.length)
  @ArrayMaxSize(SHIPPING_METHOD_IDS.length)
  @ValidateNested({ each: true })
  @Type(() => ShippingMethodConfigDto)
  methods: ShippingMethodConfigDto[];

  // Không bắt buộc để dòng cấu hình lưu trước khi có chính sách đổi trả vẫn hợp lệ → dùng giá trị mặc định
  @IsOptional()
  @ValidateNested()
  @Type(() => ReturnPolicyConfigDto)
  returnPolicy?: ReturnPolicyConfigDto;
}

const flatten = (errors: ValidationError[], parent = ''): string[] =>
  errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => `${path}: ${message}`);
    return [...own, ...flatten(error.children ?? [], path)];
  });

export type ParsedShippingConfig = { ok: true; config: ShippingConfig } | { ok: false; errors: string[] };

/** Parse + kiểm tra chuỗi JSON cấu hình ship. Field lạ bị từ chối; `methods` phải có đúng mỗi id trong `SHIPPING_METHOD_IDS` một lần. */
export function parseShippingConfig(value: string): ParsedShippingConfig {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return { ok: false, errors: ['value: must be valid JSON'] };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, errors: ['value: must be a JSON object'] };
  }

  const instance = plainToInstance(ShippingConfigDto, json);
  const errors = flatten(validateSync(instance, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
  if (!errors.length) {
    const ids = instance.methods.map((method) => method.id);
    for (const id of SHIPPING_METHOD_IDS) {
      if (ids.filter((x) => x === id).length !== 1) errors.push(`methods: must contain "${id}" exactly once`);
    }
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    config: {
      freeShippingThresholdVnd: instance.freeShippingThresholdVnd,
      returnPolicy: instance.returnPolicy
        ? {
            days: instance.returnPolicy.days,
            description: instance.returnPolicy.description,
            conditions: [...instance.returnPolicy.conditions],
          }
        : structuredClone(DEFAULT_SHIPPING_CONFIG.returnPolicy),
      methods: SHIPPING_METHOD_IDS.map((id) => {
        const { name, description, estimatedDays, priceVnd, icon } = instance.methods.find((method) => method.id === id)!;
        return { id, name, description, estimatedDays, priceVnd, icon };
      }),
    },
  };
}

/** Dùng cho upsert admin: trả JSON chuẩn hoá (thứ tự phương thức cố định) hoặc ném `SITE_CONFIG_VALUE_INVALID` */
export function validateShippingConfigValue(value: string): string {
  const result = parseShippingConfig(value);
  if (!result.ok) {
    throwAppError(ESiteConfigErrorCode.SITE_CONFIG_VALUE_INVALID, `Invalid SHIPPING_CONFIG: ${result.errors.join('; ')}`);
  }
  return JSON.stringify(result.config);
}
