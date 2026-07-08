import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAddressDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  addressLine1: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  addressLine2?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  city: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  province?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ default: 'Vietnam' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateAddressDto extends CreateAddressDto {}
