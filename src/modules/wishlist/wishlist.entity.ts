import { customAlphabet } from 'nanoid';
import { BeforeInsert, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { Product } from '../product/product.entity';
import { User } from '../user/user.entity';

const nanoid16 = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16);

@Entity('wishlists')
@Unique(['userId', 'productId'])
export class Wishlist {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  id: string;

  @Column({ type: 'varchar', length: 16, name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 16, name: 'product_id' })
  productId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = nanoid16();
  }
}
