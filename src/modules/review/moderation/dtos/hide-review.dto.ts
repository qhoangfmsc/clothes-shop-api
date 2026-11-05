import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class HideReviewDto {
  @ApiProperty({ maxLength: 500, description: 'Lý do ẩn (khách thấy)' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note: string;
}
