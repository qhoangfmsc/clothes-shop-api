import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { Category } from './category.entity';

@Entity('subcategories')
@Unique('UQ_subcategories_category_slug', ['category', 'slug'])
export class SubCategory extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'int', default: 0 })
  count: number;

  @ManyToOne(
    () => Category,
    (cat) => cat.subcategories,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'category_id' })
  category: Category;
}
