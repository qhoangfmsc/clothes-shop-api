import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateQrPaymentDto {
  @ApiProperty({ description: 'ID đơn hàng cần thanh toán (đơn của chính user)', example: 'aB3dE5fG7hJ9kL1m' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  orderId: string;
}
