import { ORDER_STATUSES, OrderStatus } from '@common/constants/enum-values.constant';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: ORDER_STATUSES,
    example: 'confirmed',
    description: 'Trạng thái mới của đơn hàng',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(ORDER_STATUSES)
  status: OrderStatus;
}
