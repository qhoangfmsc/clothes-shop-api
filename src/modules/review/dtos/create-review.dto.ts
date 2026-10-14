import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { REVIEW_FITS, REVIEW_MAX_IMAGES } from '../review.constant';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateReviewDto {
  @ApiProperty({ description: 'ID dòng hàng của đơn đã giao (`items[].id` trong chi tiết đơn)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  orderItemId: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Không được chứa liên kết' })
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ enum: REVIEW_FITS, description: 'Form/size so với size đã mua' })
  @IsString()
  @IsOptional()
  @IsIn(REVIEW_FITS)
  fit?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: REVIEW_MAX_IMAGES,
    description: 'URL ảnh đã upload qua POST /api/reviews/images (chỉ nhận ảnh của chính mình)',
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(REVIEW_MAX_IMAGES)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  images?: string[];
}
