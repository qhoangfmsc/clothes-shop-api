import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentService } from './payment.service';

/**
 * Mỗi phút đánh dấu các mã chuyển khoản đã quá hạn là `EXPIRED` trong DB, để trạng thái lưu trong DB luôn đúng thực tế
 * (không phải chờ ai đó mở màn hình). Idempotent nên chạy trùng ở nhiều instance cũng an toàn.
 */
@Injectable()
export class PaymentExpiryScheduler {
  private readonly logger = new Logger(PaymentExpiryScheduler.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireOverdueAttempts() {
    try {
      const expired = await this.paymentService.expireOverdueAttempts();
      if (expired > 0) this.logger.log(`Marked ${expired} overdue payment session(s) as EXPIRED`);
    } catch (error) {
      this.logger.error(`Failed to expire overdue payment sessions: ${(error as Error)?.message}`);
    }
  }
}
