import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Order } from '../order/order.entity';
import { ReturnReason, ReturnStatus } from './return.constant';

/** Yêu cầu trả hàng của khách cho một đơn đã giao và đã thanh toán. Tiền hoàn do module payment (`refunds`) theo dõi */
@Entity('return_requests')
export class ReturnRequest extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'order_id' })
  orderId: string;

  @Column({ type: 'varchar', length: 10, default: 'REQUESTED' })
  status: ReturnStatus;

  @Column({ type: 'varchar', length: 20 })
  reason: ReturnReason;

  /** Ghi chú của khách */
  @Column({ type: 'varchar', length: 500, default: '' })
  note: string;

  /** Phản hồi của cửa hàng cho khách (hướng dẫn gửi hàng khi duyệt, lý do khi từ chối) */
  @Column({ type: 'varchar', length: 500, name: 'admin_note', nullable: true })
  adminNote: string | null;

  @Column({ type: 'varchar', length: 16, name: 'requested_by', nullable: true })
  requestedBy: string | null;

  /** Admin xử lý gần nhất */
  @Column({ type: 'varchar', length: 16, name: 'processed_by', nullable: true })
  processedBy: string | null;

  @Column({ type: 'timestamp with time zone', name: 'approved_at', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'received_at', nullable: true })
  receivedAt: Date | null;

  /** Phí ship của đơn đã được tính vào khoản hoàn của yêu cầu này (mỗi đơn chỉ hoàn phí ship một lần) */
  @Column({ type: 'boolean', name: 'shipping_refunded', default: false })
  shippingRefunded: boolean;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Order;
}
