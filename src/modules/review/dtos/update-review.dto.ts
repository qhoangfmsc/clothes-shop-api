import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { REVIEW_FITS, REVIEW_MAX_IMAGES } from '../review.constant';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Sửa đánh giá (một lần duy nhất): chỉ gửi field muốn đổi, phải có ít nhất một field */
export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

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

  @ApiPropertyOptional({ enum: REVIEW_FITS })
  @IsString()
  @IsOptional()
  @IsIn(REVIEW_FITS)
  fit?: string;

  @ApiPropertyOptional({ type: [String], maxItems: REVIEW_MAX_IMAGES, description: 'Thay toàn bộ danh sách ảnh (`[]` = bỏ hết ảnh)' })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(REVIEW_MAX_IMAGES)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  images?: string[];
}
