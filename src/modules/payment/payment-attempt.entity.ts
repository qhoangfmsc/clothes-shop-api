import { BaseEntity } from '@common/base/base.entity';
import { bigintTransformer } from '@common/base/column-transformers';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Order } from '../order/order.entity';
import { PaymentAttemptStatus } from './payment.constant';

@Entity('payment_attempts')
export class PaymentAttempt extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'order_id' })
  orderId: string;

  @Column({ type: 'varchar', length: 32, name: 'transfer_code', unique: true })
  transferCode: string;

  /** Số tiền VND phải chuyển (bằng `orders.total` lúc tạo phiên) */
  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: number;

  /** Số tài khoản nhận tiền tại thời điểm tạo phiên */
  @Column({ type: 'varchar', length: 50, name: 'bank_account' })
  bankAccount: string;

  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: PaymentAttemptStatus;

  @Column({ type: 'timestamp with time zone', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamp with time zone', name: 'paid_at', nullable: true })
  paidAt: Date | null;

  /** Admin tạo mã này cho đơn (vd khách thanh toán tại cửa hàng); null = khách tự tạo */
  @Column({ type: 'varchar', length: 16, name: 'created_by', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Order;
}
