import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Product } from '../product/product.entity';
import { Cart } from './cart.entity';

@Entity('cart_items')
export class CartItem extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'cart_id' })
  cartId: string;

  @Column({ type: 'varchar', length: 16, name: 'product_id' })
  productId: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', length: 50, default: '' })
  size: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  color: string;

  @ManyToOne(
    () => Cart,
    (cart) => cart.items,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'cart_id' })
  cart: Cart;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
