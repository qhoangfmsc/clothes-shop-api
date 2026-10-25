import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Tạo yêu cầu hoàn tiền thủ công cho đơn đã huỷ mà đã thu tiền (đơn huỷ trước khi có luồng hoàn tiền, hoặc yêu cầu cũ đã bị từ chối) */
export class CreateRefundDto {
  @ApiProperty({ description: 'Đơn đã huỷ và đã thanh toán' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  orderId: string;
}
