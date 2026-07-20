import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

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

  @ApiProperty({ example: 350000 })
  @IsNumber()
  @Min(0.01)
  price: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  originalPrice?: number;

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

  @ApiPropertyOptional({ example: 'new' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  badge?: string;

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

  @ApiPropertyOptional({ default: 'active', enum: ['active', 'disabled'] })
  @IsString()
  @IsOptional()
  @IsIn(['active', 'disabled'])
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

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  price?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0)
  originalPrice?: number;

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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(50)
  badge?: string;

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

  @ApiPropertyOptional({ enum: ['active', 'disabled'] })
  @IsString()
  @IsOptional()
  @IsIn(['active', 'disabled'])
  @MaxLength(20)
  status?: string;
}
