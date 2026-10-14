import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '../user/user.entity';
import { Review } from './review.entity';

/** Một lượt "hữu ích" của một user cho một đánh giá (UNIQUE theo cặp review + user) */
@Entity('review_votes')
export class ReviewVote extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'review_id' })
  reviewId: string;

  @Column({ type: 'varchar', length: 16, name: 'user_id' })
  userId: string;

  @ManyToOne(() => Review, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review: Review;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
