import { EntityManager } from 'typeorm';
import { Product } from './product.entity';

/** Ghi điểm đánh giá lưu sẵn trên sản phẩm (`rating_count`, `rating_average`); module review tính số liệu từ các đánh giá `PUBLISHED` rồi gọi, sau khi đã khoá dòng sản phẩm */
export async function setProductRating(
  manager: EntityManager,
  productId: string,
  rating: { count: number; average: number | null },
): Promise<void> {
  await manager.update(Product, { id: productId }, { ratingCount: rating.count, ratingAverage: rating.average });
}
