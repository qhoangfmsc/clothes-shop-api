import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
