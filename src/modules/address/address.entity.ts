import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@common/base/base.entity';
import { User } from '../user/user.entity';

@Entity('addresses')
export class Address extends BaseEntity {
  @Column({ type: 'varchar', length: 16, name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  label: string;

  @Column({ type: 'varchar', length: 255, name: 'full_name' })
  fullName: string;

  @Column({ type: 'varchar', length: 50 })
  phone: string;

  @Column({ type: 'varchar', length: 500, name: 'address_line_1' })
  addressLine1: string;

  @Column({ type: 'varchar', length: 500, default: '', name: 'address_line_2' })
  addressLine2: string;

  @Column({ type: 'varchar', length: 255 })
  city: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  province: string;

  @Column({ type: 'varchar', length: 20, default: '', name: 'postal_code' })
  postalCode: string;

  @Column({ type: 'varchar', length: 100, default: 'Vietnam' })
  country: string;

  @Column({ type: 'boolean', default: false, name: 'is_default' })
  isDefault: boolean;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
