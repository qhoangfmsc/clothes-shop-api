import { ACTIVE_STATUSES, ActiveStatus, PRODUCT_BADGES } from '@common/constants/enum-values.constant';
import { MAX_MONEY_VND } from '@common/utils/money.util';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
  status?: ActiveStatus;
}

export class UpdateProductDto extends PartialType(CreateProductDto, { skipNullProperties: false }) {}
