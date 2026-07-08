import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, BeforeInsert } from 'typeorm';
import { customAlphabet } from 'nanoid';
import { Order } from './order.entity';
import { Product } from '../product/product.entity';

const nanoid16 = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16);

@Entity('order_items')
export class OrderItem {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  id: string;

  @Column({ type: 'varchar', length: 16, name: 'order_id' })
  orderId: string;

  @Column({ type: 'varchar', length: 16, nullable: true, name: 'product_id' })
  productId: string | null;

  @Column({ type: 'varchar', length: 255, name: 'product_name' })
  productName: string;

  @Column({ type: 'varchar', length: 500, default: '', name: 'product_image' })
  productImage: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', length: 50, default: '' })
  size: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  color: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => Product, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @BeforeInsert()
  generateId() {
    if (!this.id) this.id = nanoid16();
  }
}
