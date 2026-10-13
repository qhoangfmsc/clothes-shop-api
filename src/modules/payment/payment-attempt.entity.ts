import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Order } from '../order/order.entity';
import { PaymentAttemptStatus } from './payment.constant';

/** bigint của Postgres về dạng chuỗi → ép về number (số tiền VND luôn nằm trong vùng an toàn của number) */
export const bigintTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};

@Entity('payment_attempts')
export class PaymentAttempt extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'order_id' })
  orderId: string;

  @Column({ type: 'varchar', length: 32, name: 'transfer_code', unique: true })
  transferCode: string;

  /** Số tiền VND phải chuyển (đã quy đổi từ `orders.total`) */
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

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Order;
}
