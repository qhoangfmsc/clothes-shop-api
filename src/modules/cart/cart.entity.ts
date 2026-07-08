import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '@common/base/base.entity';
import { User } from '../user/user.entity';
import { CartItem } from './cart-item.entity';

@Entity('carts')
export class Cart extends BaseEntity {
  @Column({ type: 'varchar', length: 16, unique: true, name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true })
  items: CartItem[];
}
