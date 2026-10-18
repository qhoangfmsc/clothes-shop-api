import { BaseEntity } from '@common/base/base.entity';
import { bigintTransformer, numericTransformer } from '@common/base/column-transformers';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { User } from '../user/user.entity';
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order extends BaseEntity {
  @Column({ type: 'varchar', length: 16, nullable: true, name: 'user_id' })
  userId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string; // pending | confirmed | shipping | delivered | completed | cancelled

  /** Tiền hàng (VND, số nguyên) */
  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  subtotal: number;

  /** Phí ship (VND, số nguyên) */
  @Column({ type: 'bigint', default: 0, name: 'shipping_fee', transformer: bigintTransformer })
  shippingFee: number;

  /** Tổng thanh toán (VND, số nguyên): `subtotal + shippingFee`; cũng là số tiền khách chuyển khoản */
  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer })
  total: number;

  /** Tỷ giá lúc đặt đơn (VND cho 1 USD), dùng để suy ra mọi giá trị USD của đơn */
  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'exchange_rate', transformer: numericTransformer })
  exchangeRate: number;

  @Column({ type: 'varchar', length: 100, default: '', name: 'shipping_method' })
  shippingMethod: string;

  @Column({ type: 'jsonb', default: {}, name: 'shipping_address' })
  shippingAddress: Record<string, any>;

  @Column({ type: 'varchar', length: 500, default: '' })
  note: string;

  /** Tách khỏi `status` (luồng giao hàng): webhook SePay / admin xác nhận đổi unpaid → paid; admin hoàn tiền xong đổi paid → refunded */
  @Column({ type: 'varchar', length: 10, default: 'unpaid', name: 'payment_status' })
  paymentStatus: string; // unpaid | paid | refunded

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'paid_at' })
  paidAt: Date | null;

  /** Lúc admin chuyển đơn sang `delivered`: mốc tính hạn đổi trả (`returnPolicy.days`) */
  @Column({ type: 'timestamp with time zone', nullable: true, name: 'delivered_at' })
  deliveredAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(
    () => OrderItem,
    (item) => item.order,
    { cascade: true },
  )
  items: OrderItem[];
}
