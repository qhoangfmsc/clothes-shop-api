import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { User } from '../user/user.entity';
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order extends BaseEntity {
  @Column({ type: 'varchar', length: 16, nullable: true, name: 'user_id' })
  userId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string; // pending | confirmed | shipping | delivered | completed | cancelled

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'shipping_fee' })
  shippingFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;

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
