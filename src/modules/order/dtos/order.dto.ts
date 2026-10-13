import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SHIPPING_METHOD_IDS } from '../../shipping/shipping-config';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Input chung của báo giá (`POST /api/orders/quote`) và checkout: chọn dòng giỏ + phương thức giao */
export class QuoteOrderDto {
  @ApiPropertyOptional({ default: 'standard', enum: SHIPPING_METHOD_IDS })
  @IsString()
  @IsOptional()
  @IsIn(SHIPPING_METHOD_IDS)
  @MaxLength(100)
  shippingMethod?: string;

  @ApiPropertyOptional({
    description: 'IDs of the cart items to order. Omit to order the whole cart; unselected items stay in the cart.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(16, { each: true })
  cartItemIds?: string[];
}

/** Người nhận hàng tại cửa hàng (thay cho địa chỉ khi `shippingMethod = store-pickup`) */
export class PickupContactDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @ApiProperty({ example: '0901234567' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone: string;
}

export class CreateOrderDto extends QuoteOrderDto {
  @ApiPropertyOptional({
    description:
      'Address ID for shipping. Required for standard/express. For store-pickup send either addressId or pickupContact (not both).',
  })
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(16)
  addressId?: string;

  @ApiPropertyOptional({
    type: PickupContactDto,
    description: 'Only for store-pickup without addressId. The order snapshot keeps { fullName, phone } only.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PickupContactDto)
  pickupContact?: PickupContactDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
