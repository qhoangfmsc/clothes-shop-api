import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CART_MAX_ITEM_QUANTITY } from '../cart.constant';

export class AddToCartDto {
  @ApiProperty({ description: 'Product ID (16 chars)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  productId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @Max(CART_MAX_ITEM_QUANTITY)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  size?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  color?: string;
}

export class UpdateCartItemDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(CART_MAX_ITEM_QUANTITY)
  quantity: number;
}
