import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectRefundDto {
  @ApiProperty({
    description: 'Lý do không hoàn tiền (bắt buộc, lưu để kiểm tra sau)',
    example: 'Khách đã nhận hàng trực tiếp tại cửa hàng',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note: string;
}
