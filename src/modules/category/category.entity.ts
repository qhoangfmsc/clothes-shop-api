import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { SubCategory } from './sub-category.entity';

@Entity('categories')
export class Category extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'hero_image' })
  heroImage: string | null;

  /** Thứ hạng hiển thị duy nhất: 1 = ưu tiên cao nhất, số càng lớn càng thấp. */
  @Column({ type: 'int' })
  priority: number;

  @OneToMany(
    () => SubCategory,
    (sub) => sub.category,
    { eager: true, cascade: true },
  )
  subcategories: SubCategory[];
}
