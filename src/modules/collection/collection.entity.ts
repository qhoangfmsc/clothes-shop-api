import { Column, Entity } from 'typeorm';
import { BaseEntity } from '@common/base/base.entity';

@Entity('collections')
export class Collection extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  subtitle: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 500 })
  image: string;

  @Column({ type: 'jsonb', default: [], name: 'product_ids' })
  productIds: string[];

  @Column({ type: 'varchar', length: 100, default: '' })
  season: string;
}
