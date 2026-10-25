import { Product } from '../../product/shared/product.entity';
import { presentProductSummary } from '../../product/shared/product.presenter';
import { Review } from './review.entity';
import { editDeadline, reviewEditBlock } from './review-eligibility.util';

export const productSummary = (product?: Product | null) => (product ? presentProductSummary(product) : null);

/** Phần công khai của một đánh giá (không lộ `userId`, `orderItemId`, ghi chú kiểm duyệt) */
export const toPublicView = (r: Review) => ({
  id: r.id,
  author: r.author,
  avatar: r.avatar,
  rating: r.rating,
  date: r.date,
  createdAt: r.createdAt,
  title: r.title,
  content: r.content,
  verified: r.verified,
  fit: r.fit,
  images: r.images ?? [],
  size: r.size,
  color: r.color,
  helpfulCount: r.helpfulCount,
  edited: r.editedAt !== null,
  reply: r.reply ? { content: r.reply, repliedAt: r.repliedAt } : null,
});

/** Góc nhìn của tác giả: thêm trạng thái, lý do bị ẩn và việc còn sửa được hay không */
export const toOwnView = (r: Review) => {
  const block = reviewEditBlock(r);
  return {
    ...toPublicView(r),
    productId: r.productId,
    orderItemId: r.orderItemId,
    product: productSummary(r.product),
    status: r.status,
    moderationNote: r.status === 'HIDDEN' ? r.moderationNote : null,
    editedAt: r.editedAt,
    canEdit: block === null,
    editableUntil: block === null ? editDeadline(r.createdAt) : null,
  };
};

export const toAdminView = (r: Review) => ({
  ...toPublicView(r),
  productId: r.productId,
  orderItemId: r.orderItemId,
  userId: r.userId,
  product: productSummary(r.product),
  status: r.status,
  moderationNote: r.moderationNote,
  moderatedBy: r.moderatedBy,
  moderatedAt: r.moderatedAt,
  editedAt: r.editedAt,
  repliedBy: r.repliedBy,
});
