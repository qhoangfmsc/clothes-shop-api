import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const HERO_IMAGE_EXAMPLE = 'https://example.com/category-hero.jpg';

export class CreateSubCategoryDto {
  @ApiProperty({ example: 'tshirt' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug: string;

  @ApiProperty({ example: 'T-Shirt' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @ApiPropertyOptional({ example: 'Áo thun các loại' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @IsOptional()
  @Min(0)
  count?: number;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'tops' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug: string;

  @ApiProperty({ example: 'Tops' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'Tất cả áo, từ T-shirt đến blouse' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: HERO_IMAGE_EXAMPLE,
    nullable: true,
    description: 'Ảnh banner hero cho category, hiển thị ở CategoryGrid',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  heroImage?: string | null;

  @ApiPropertyOptional({ type: [CreateSubCategoryDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateSubCategoryDto)
  subcategories?: CreateSubCategoryDto[];
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: HERO_IMAGE_EXAMPLE,
    nullable: true,
    description: 'Ảnh banner hero cho category, hiển thị ở CategoryGrid',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  heroImage?: string | null;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description: 'Thứ hạng mới (1 = ưu tiên cao nhất). Các danh mục khác tự dịch chỗ để không trùng',
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  priority?: number;

  @ApiPropertyOptional({ type: [CreateSubCategoryDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateSubCategoryDto)
  subcategories?: CreateSubCategoryDto[];
}

export class ReorderCategoriesDto {
  @ApiProperty({
    type: [String],
    example: ['V1StGXR8_Z5jdHi6', 'abcDEF1234567890'],
    description: 'Toàn bộ id danh mục theo thứ tự mới: phần tử đầu = priority 1',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(255, { each: true })
  ids: string[];
}
