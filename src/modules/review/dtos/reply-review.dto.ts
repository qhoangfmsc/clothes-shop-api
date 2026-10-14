import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ReplyReviewDto {
  @ApiProperty({ maxLength: 1000, description: 'Phản hồi của cửa hàng, hiển thị công khai dưới đánh giá' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;
}
