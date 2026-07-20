import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { Product } from '../product/product.entity';

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

  @ManyToMany(() => Product)
  @JoinTable({
    name: 'collection_products',
    joinColumn: { name: 'collection_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'product_id', referencedColumnName: 'id' },
  })
  products: Product[];

  @Column({ type: 'varchar', length: 100, default: '' })
  season: string;
}
