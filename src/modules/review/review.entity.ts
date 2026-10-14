import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { OrderItem } from '../order/order-item.entity';
import { Product } from '../product/product.entity';
import { User } from '../user/user.entity';
import { ReviewFit, ReviewStatus } from './review.constant';

/**
 * Đánh giá sản phẩm. Đánh giá của khách luôn gắn với một dòng hàng đã mua (`orderItemId`, mỗi dòng hàng một đánh giá);
 * các dòng seed cũ không có `orderItemId`.
 */
@Entity('reviews')
export class Review extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'product_id' })
  productId: string;

  @Column({ type: 'varchar', length: 16, nullable: true, name: 'user_id' })
  userId: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true, name: 'order_item_id' })
  orderItemId: string | null;

  /** Snapshot tên/ảnh của khách lúc viết */
  @Column({ type: 'varchar', length: 255 })
  author: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  avatar: string;

  @Column({ type: 'int' })
  rating: number;

  /** Ngày viết dạng chuỗi hiển thị (`YYYY-MM-DD` với đánh giá mới) */
  @Column({ type: 'varchar', length: 50 })
  date: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  content: string;

  /** `true` = người viết đã mua sản phẩm (mọi đánh giá của khách đều `true`) */
  @Column({ type: 'boolean', default: false })
  verified: boolean;

  /** Snapshot size/màu của dòng hàng đã mua */
  @Column({ type: 'varchar', length: 50, default: '' })
  size: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  color: string;

  /** URL ảnh khách đính kèm (tối đa `REVIEW_MAX_IMAGES`), chỉ nhận ảnh chính chủ đã upload qua endpoint ảnh đánh giá */
  @Column({ type: 'jsonb', default: [] })
  images: string[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  fit: ReviewFit | null;

  @Column({ type: 'varchar', length: 10, default: 'PUBLISHED' })
  status: ReviewStatus;

  /** Số lượt "hữu ích" (đếm lại từ `review_votes` trong cùng transaction với mỗi lượt vote) */
  @Column({ type: 'int', name: 'helpful_count', default: 0 })
  helpfulCount: number;

  /** Lúc khách sửa (chỉ được sửa một lần); `null` = chưa sửa */
  @Column({ type: 'timestamp with time zone', name: 'edited_at', nullable: true })
  editedAt: Date | null;

  /** Lý do ẩn (bắt buộc khi `HIDDEN`, khách thấy) */
  @Column({ type: 'varchar', length: 500, name: 'moderation_note', nullable: true })
  moderationNote: string | null;

  @Column({ type: 'varchar', length: 16, name: 'moderated_by', nullable: true })
  moderatedBy: string | null;

  @Column({ type: 'timestamp with time zone', name: 'moderated_at', nullable: true })
  moderatedAt: Date | null;

  /** Phản hồi của cửa hàng, hiển thị công khai dưới đánh giá */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  reply: string | null;

  @Column({ type: 'varchar', length: 16, name: 'replied_by', nullable: true })
  repliedBy: string | null;

  @Column({ type: 'timestamp with time zone', name: 'replied_at', nullable: true })
  repliedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => OrderItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem: OrderItem | null;
}
