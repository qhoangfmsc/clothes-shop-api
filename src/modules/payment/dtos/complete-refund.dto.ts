import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Admin đã chuyển khoản trả khách: ghi mã giao dịch ngân hàng của lần chuyển đó */
export class CompleteRefundDto {
  @ApiProperty({
    description: 'Mã giao dịch ngân hàng của lần chuyển hoàn tiền (lưu nguyên văn, không trùng với khoản hoàn khác)',
    example: 'FT26287123456',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  reference: string;

  @ApiProperty({
    description: 'Ghi chú (vd: đã chuyển về tài khoản khách đã dùng lúc thanh toán, lúc nào)',
    example: 'Chuyển lại đúng tài khoản nguồn, VCB 14:05',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note: string;
}
