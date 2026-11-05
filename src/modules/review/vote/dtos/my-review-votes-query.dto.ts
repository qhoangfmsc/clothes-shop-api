import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Không phải list: trả mảng id đánh giá đã vote của một sản phẩm, không phân trang */
export class MyReviewVotesQueryDto {
  @ApiProperty({ description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  productId: string;
}
