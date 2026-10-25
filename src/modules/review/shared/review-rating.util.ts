import { findLocked } from '@common/base/lock.util';
import { EntityManager } from 'typeorm';
import { Product } from '../../product/product.entity';
import { setProductRating } from '../../product/product-rating.util';
import { Review } from './review.entity';

/** Khoá dòng sản phẩm; mọi thay đổi đánh giá chạy tuần tự theo sản phẩm nên số liệu tổng hợp luôn tính trên dữ liệu đã commit */
export async function lockProduct(manager: EntityManager, productId: string) {
  await findLocked(manager, Product, { id: productId }, { select: { id: true } });
}

/** Tính lại `products.rating_average`/`rating_count` từ các đánh giá `PUBLISHED` (gọi sau `lockProduct`, trong cùng transaction) */
export async function refreshProductRating(manager: EntityManager, productId: string) {
  const row = await manager
    .createQueryBuilder(Review, 'r')
    .select('COUNT(*)', 'count')
    .addSelect('ROUND(AVG(r.rating)::numeric, 1)', 'average')
    .where('r.productId = :productId', { productId })
    .andWhere('r.status = :status', { status: 'PUBLISHED' })
    .getRawOne<{ count: string; average: string | null }>();
  const ratingCount = Number(row?.count ?? 0);
  await setProductRating(manager, productId, { count: ratingCount, average: ratingCount > 0 ? Number(row?.average) : null });
}
