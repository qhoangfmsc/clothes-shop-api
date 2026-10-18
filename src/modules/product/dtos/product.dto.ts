import { ACTIVE_STATUSES, PRODUCT_BADGES } from '@common/constants/enum-values.constant';
import { MAX_MONEY_VND } from '@common/utils/money.util';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

class ColorDto {
  @ApiProperty({ example: 'Red' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '#FF0000' })
  @IsString()
  @IsNotEmpty()
  hex: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'ao-thun-trang' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug: string;

  @ApiPropertyOptional({ example: 'tops-tshirt-ao-thun-trang' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  sku?: string;

  @ApiProperty({ example: 'Áo Thun Trắng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 350000, description: 'Giá bán (VND, số nguyên)' })
  @IsInt()
  @Min(1)
  @Max(MAX_MONEY_VND)
  priceVnd: number;

  @ApiPropertyOptional({ example: 500000, description: 'Giá gốc (VND, số nguyên), phải >= giá bán' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(MAX_MONEY_VND)
  originalPriceVnd?: number;

  @ApiProperty({ example: ['https://example.com/image1.jpg'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  images: string[];

  @ApiProperty({ example: 'abc123def456...', description: 'Category ID (nanoid16)' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ example: 'abc123def456...', description: 'SubCategory ID (nanoid16)' })
  @IsString()
  @IsNotEmpty()
  subcategoryId: string;

  @ApiPropertyOptional({ enum: PRODUCT_BADGES, example: 'new', nullable: true })
  @IsIn(PRODUCT_BADGES)
  @IsOptional()
  badge?: string | null;

  @ApiProperty({ example: 'Áo thun cotton cao cấp...' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: '100% Cotton' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  material: string;

  @ApiProperty({ example: 'Giặt máy ở chế độ nhẹ, không dùng chất tẩy mạnh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  care: string;

  @ApiProperty({ example: ['S', 'M', 'L', 'XL'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  sizes: string[];

  @ApiProperty({ type: [ColorDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ColorDto)
  colors: ColorDto[];

  @ApiProperty({ example: ['basic', 'summer'] })
  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @ApiPropertyOptional({ default: 'active', enum: ACTIVE_STATUSES })
  @IsString()
  @IsOptional()
  @IsIn(ACTIVE_STATUSES)
  @MaxLength(20)
  status?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  sku?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Giá bán (VND, số nguyên)' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(MAX_MONEY_VND)
  priceVnd?: number;

  @ApiPropertyOptional({ description: 'Giá gốc (VND, số nguyên), phải >= giá bán' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(MAX_MONEY_VND)
  originalPriceVnd?: number;

  @ApiPropertyOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({ description: 'Category ID (nanoid16)' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'SubCategory ID (nanoid16)' })
  @IsString()
  @IsOptional()
  subcategoryId?: string;

  @ApiPropertyOptional({ enum: PRODUCT_BADGES, nullable: true })
  @IsIn(PRODUCT_BADGES)
  @IsOptional()
  badge?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  material?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  care?: string;

  @ApiPropertyOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsOptional()
  sizes?: string[];

  @ApiPropertyOptional({ type: [ColorDto] })
  @IsArray()
  @ArrayMinSize(1)
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ColorDto)
  colors?: ColorDto[];

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: ACTIVE_STATUSES })
  @IsString()
  @IsOptional()
  @IsIn(ACTIVE_STATUSES)
  @MaxLength(20)
  status?: string;
}
