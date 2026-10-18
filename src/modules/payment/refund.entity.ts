import { BaseEntity } from '@common/base/base.entity';
import { bigintTransformer } from '@common/base/column-transformers';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Order } from '../order/order.entity';
import { RefundReason, RefundStatus } from './payment.constant';
import { PaymentAttempt } from './payment-attempt.entity';

/**
 * Yêu cầu hoàn tiền cho đơn đã thanh toán. Hệ thống không tự chuyển tiền: admin chuyển khoản trả khách bằng ngân hàng
 * rồi ghi lại mã giao dịch hoàn ở đây.
 */
@Entity('refunds')
export class Refund extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'order_id' })
  orderId: string;

  /** Phiên thanh toán đã nhận tiền (`PAID`) mà khoản hoàn này trả lại */
  @Column({ type: 'varchar', length: 16, name: 'payment_attempt_id' })
  paymentAttemptId: string;

  /** VND */
  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'REQUESTED' })
  status: RefundStatus;

  @Column({ type: 'varchar', length: 20 })
  reason: RefundReason;

  /** Yêu cầu trả hàng sinh ra khoản hoàn này (chỉ khi `reason = RETURN`) */
  @Column({ type: 'varchar', length: 16, name: 'return_request_id', nullable: true })
  returnRequestId: string | null;

  /** Người tạo yêu cầu: khách (tự huỷ đơn) hoặc admin */
  @Column({ type: 'varchar', length: 16, name: 'requested_by', nullable: true })
  requestedBy: string | null;

  /** Admin xử lý (COMPLETED hoặc REJECTED) */
  @Column({ type: 'varchar', length: 16, name: 'processed_by', nullable: true })
  processedBy: string | null;

  @Column({ type: 'timestamp with time zone', name: 'processed_at', nullable: true })
  processedAt: Date | null;

  /** Mã giao dịch ngân hàng của lần chuyển khoản hoàn, nguyên văn như admin nhập (chỉ có khi COMPLETED) */
  @Column({ type: 'varchar', length: 64, name: 'bank_reference', nullable: true })
  bankReference: string | null;

  /** Ghi chú của admin khi hoàn xong hoặc từ chối */
  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => PaymentAttempt, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_attempt_id' })
  paymentAttempt: PaymentAttempt;
}
