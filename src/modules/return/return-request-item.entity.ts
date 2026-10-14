import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { OrderItem } from '../order/order-item.entity';
import { ReturnRequest } from './return-request.entity';

@Unique('UQ_return_request_items_request_and_item', ['returnRequestId', 'orderItemId'])
@Entity('return_request_items')
export class ReturnRequestItem extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'return_request_id' })
  returnRequestId: string;

  @Column({ type: 'varchar', length: 16, name: 'order_item_id' })
  orderItemId: string;

  /** Số lượng khách xin trả */
  @Column({ type: 'int' })
  quantity: number;

  /** Số lượng cửa hàng chấp nhận khi nhận hàng (null cho đến lúc đó) */
  @Column({ type: 'int', name: 'accepted_quantity', nullable: true })
  acceptedQuantity: number | null;

  @ManyToOne(() => ReturnRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest: ReturnRequest;

  @ManyToOne(() => OrderItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: OrderItem;
}
