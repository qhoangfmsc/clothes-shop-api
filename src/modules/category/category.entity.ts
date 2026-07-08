import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '@common/base/base.entity';
import { SubCategory } from './sub-category.entity';

@Entity('categories')
export class Category extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @OneToMany(() => SubCategory, (sub) => sub.category, { eager: true, cascade: true })
  subcategories: SubCategory[];
}
