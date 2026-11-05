import { EntityManager, In } from 'typeorm';
import { CartItem } from './cart-item.entity';

/** Sau khi đặt hàng: bỏ đúng các dòng giỏ đã đặt (module cart sở hữu giỏ; order gọi trong transaction checkout) */
export async function removeOrderedCartItems(manager: EntityManager, cartId: string, itemIds: string[]): Promise<void> {
  await manager.delete(CartItem, { cartId, id: In(itemIds) });
}
