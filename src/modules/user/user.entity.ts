import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'provider_id' })
  providerId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'user' })
  role: string; // 'user' | 'admin'

  @Column({ type: 'jsonb', default: [] })
  permissions: number[];

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string; // 'active' | 'disabled'
}
