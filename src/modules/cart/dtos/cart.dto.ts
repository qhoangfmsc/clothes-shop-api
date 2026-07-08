import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddToCartDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @Max(99)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  size?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  color?: string;
}

export class UpdateCartItemDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
