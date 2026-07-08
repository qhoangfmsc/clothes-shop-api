import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/base/base.entity';
import { User } from '../user/user.entity';

@Entity('reviews')
export class Review extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'product_id' })
  productId: string;

  @Column({ type: 'varchar', length: 16, nullable: true, name: 'user_id' })
  userId: string | null;

  @Column({ type: 'varchar', length: 255 })
  author: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  avatar: string;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'varchar', length: 50 })
  date: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'boolean', default: false })
  verified: boolean;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}
