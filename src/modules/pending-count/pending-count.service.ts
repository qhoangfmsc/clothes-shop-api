import { Permission } from '@common/permissions/permissions.constant';
import { Injectable } from '@nestjs/common';
import { OrderService } from '../order/order.service';
import { PaymentService } from '../payment/payment.service';
import { RefundService } from '../payment/refund.service';
import { ReturnService } from '../return/return.service';
import { ReviewService } from '../review/review.service';
import { User } from '../user/user.entity';

export type PendingCounts = Partial<Record<'orders' | 'payments' | 'refunds' | 'returns' | 'reviews', number>>;

/**
 * Số việc đang chờ admin xử lý, hiện thành badge ở menu admin. Mỗi số là một COUNT chạy trên điều kiện DÙNG CHUNG với bộ lọc danh sách
 * tương ứng (nên số ở menu luôn bằng `total` của danh sách đã lọc). Chỉ chạy COUNT mà người gọi có quyền xem mục đó.
 */
@Injectable()
export class PendingCountService {
  constructor(
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
    private readonly refundService: RefundService,
    private readonly returnService: ReturnService,
    private readonly reviewService: ReviewService,
  ) {}

  async get(user: Pick<User, 'role' | 'permissions'>): Promise<{ data: PendingCounts }> {
    // Admin có toàn quyền; người khác theo danh sách permission của mình
    const can = (permission: Permission) => user.role === 'admin' || (user.permissions ?? []).includes(permission);

    // Thiếu quyền thì bỏ hẳn key (không trả 0) và không chạy COUNT
    const jobs: [keyof PendingCounts, () => Promise<number>][] = [];
    if (can(Permission.ORDER_ADMIN_VIEW)) jobs.push(['orders', () => this.orderService.countNeedsAction()]);
    if (can(Permission.PAYMENT_ADMIN_VIEW)) {
      jobs.push(['payments', () => this.paymentService.countNeedsReview()]);
      jobs.push(['refunds', () => this.refundService.countRequested()]);
    }
    if (can(Permission.RETURN_ADMIN_VIEW)) jobs.push(['returns', () => this.returnService.countRequested()]);
    if (can(Permission.REVIEW_ADMIN_VIEW)) jobs.push(['reviews', () => this.reviewService.countAwaitingReply()]);

    const values = await Promise.all(jobs.map(([, run]) => run()));
    const data: PendingCounts = {};
    jobs.forEach(([key], index) => {
      data[key] = values[index];
    });
    return { data };
  }
}
