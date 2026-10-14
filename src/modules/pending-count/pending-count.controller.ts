import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { PendingCountService } from './pending-count.service';

@ApiTags('Admin — Pending counts')
@Controller('api/admin/pending-counts')
@ApiBearerAuth()
export class PendingCountController {
  constructor(private readonly pendingCountService: PendingCountService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] Số việc đang chờ xử lý cho badge ở menu admin',
    description: [
      'Mỗi key chỉ có khi người gọi có quyền xem mục đó (thiếu quyền thì bỏ hẳn key, không trả 0). Chỉ trả số.',
      '- `orders` (ORDER_ADMIN_VIEW): đơn `pending`/`confirmed`, trừ đơn `pending` chưa thanh toán đang có mã QR còn hạn. Danh sách: GET /api/admin/orders?needsAction=true',
      '- `payments` (PAYMENT_ADMIN_VIEW): giao dịch UNMATCHED/AMOUNT_MISMATCH/LATE/NOT_PAYABLE chưa gắn đơn, hoặc gắn vào đơn chưa thanh toán và chưa huỷ. Danh sách: GET /api/admin/payments/transactions?needsReview=true',
      '- `refunds` (PAYMENT_ADMIN_VIEW): khoản hoàn REQUESTED. Danh sách: GET /api/admin/refunds?status=REQUESTED',
      '- `returns` (RETURN_ADMIN_VIEW): yêu cầu trả hàng REQUESTED (chờ duyệt; APPROVED không tính). Danh sách: GET /api/admin/returns?status=REQUESTED',
    ].join('\n'),
  })
  @ApiOkResponse({
    schema: {
      example: { data: { orders: 3, payments: 2, refunds: 1, returns: 4 } },
    },
  })
  @Permissions(Permission.ORDER_ADMIN_VIEW, Permission.PAYMENT_ADMIN_VIEW, Permission.RETURN_ADMIN_VIEW)
  get(@CurrentUser() user: User) {
    return this.pendingCountService.get(user);
  }
}
