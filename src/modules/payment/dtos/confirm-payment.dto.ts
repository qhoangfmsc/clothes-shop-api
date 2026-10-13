import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MANUAL_CONFIRM_PROVIDERS } from '../payment.constant';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Xác nhận thủ công đơn đã được thanh toán. Gửi đúng MỘT trong hai cách:
 * - `transactionId`: gắn giao dịch đã có trong `payment_transactions` (webhook tới nhưng không tự khớp)
 * - `amount` + (`reference` và/hoặc `transferCode`): ghi giao dịch mới (webhook không tới, admin đối chiếu trên SePay/sao kê ngân hàng)
 * `transferCode` (nội dung chuyển khoản khách đã dùng) chọn đúng phiên được đánh dấu đã trả, kể cả phiên đã hết hạn.
 */
export class ConfirmPaymentDto {
  @ApiPropertyOptional({ description: 'ID giao dịch trong payment_transactions (từ danh sách đối soát) cần gắn vào đơn' })
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(16)
  transactionId?: string;

  @ApiPropertyOptional({
    description:
      'Nội dung chuyển khoản khách đã dùng (vd DHG29JR5A8). Xác nhận đúng phiên mang mã này, kể cả phiên đã hết hạn; mặc định là phiên mới nhất của đơn. Với cách `amount`, nếu bỏ `reference` thì mã này cũng là mã giao dịch được ghi (provider manual).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(32)
  transferCode?: string;

  @ApiPropertyOptional({
    description:
      'Mã giao dịch SePay (provider=sepay) hoặc mã tham chiếu ngân hàng (provider=manual). Dùng với `amount`; có thể bỏ nếu đã có `transferCode`.',
  })
  @Transform(trim)
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(64)
  reference?: string;

  @ApiPropertyOptional({ description: 'Số tiền VND thực nhận. Dùng với `reference` hoặc `transferCode`.', example: 4625000 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Nội dung chuyển khoản đúng như trên sao kê (nếu khác mã đã cấp). Mặc định: mã chuyển khoản của phiên. Dùng với `amount`.',
  })
  @Transform(trim)
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(500)
  transferContent?: string;

  @ApiPropertyOptional({
    enum: MANUAL_CONFIRM_PROVIDERS,
    description: 'Mặc định `sepay` khi có `reference`, `manual` khi chỉ có `transferCode`',
  })
  @IsString()
  @IsOptional()
  @IsIn(MANUAL_CONFIRM_PROVIDERS)
  provider?: string;

  @ApiPropertyOptional({ description: 'Bắt buộc = true nếu số tiền thực nhận khác số tiền của phiên thanh toán', default: false })
  @IsBoolean()
  @IsOptional()
  acceptAmountMismatch?: boolean;

  @ApiProperty({ description: 'Lý do / bằng chứng xác nhận (lưu để kiểm tra sau)', example: 'Đã đối chiếu sao kê VCB, SePay lỗi webhook' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note: string;
}
