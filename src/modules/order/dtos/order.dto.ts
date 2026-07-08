import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ description: 'Address ID for shipping' })
  @IsString()
  @IsNotEmpty()
  addressId: string;

  @ApiPropertyOptional({ default: 'standard' })
  @IsString()
  @IsOptional()
  shippingMethod?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
