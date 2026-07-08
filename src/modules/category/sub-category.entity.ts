import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from './category.entity';

@Entity('subcategories')
export class SubCategory {
  @PrimaryGeneratedColumn('increment')
  id: number;

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
