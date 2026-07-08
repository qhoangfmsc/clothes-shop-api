import { BeforeInsert, Column, Entity } from 'typeorm';
import { BaseEntity } from '@common/base/base.entity';

@Entity('products')
export class Product extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'original_price' })
  originalPrice: number | null;

  @Column({ type: 'jsonb', default: [] })
  images: string[];

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'varchar', length: 100 })
  subcategory: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  badge: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 255 })
  material: string;

  @Column({ type: 'varchar', length: 500 })
  care: string;

  @Column({ type: 'jsonb', default: [] })
  sizes: string[];

  @Column({ type: 'jsonb', default: [] })
  colors: { name: string; hex: string }[];

  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  /**
   * Auto-generate SKU from category + subcategory + slug
   * Runs before insert if SKU is not already set
   */
  @BeforeInsert()
  generateSku() {
    if (!this.sku && this.category && this.subcategory && this.slug) {
      this.sku = `${this.category}-${this.subcategory}-${this.slug}`;
    }
  }
}
