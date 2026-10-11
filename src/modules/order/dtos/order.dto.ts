import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ description: 'Address ID for shipping' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  addressId: string;

  @ApiPropertyOptional({ default: 'standard', enum: ['standard', 'express', 'store-pickup'] })
  @IsString()
  @IsOptional()
  @IsIn(['standard', 'express', 'store-pickup'])
  @MaxLength(100)
  shippingMethod?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

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
