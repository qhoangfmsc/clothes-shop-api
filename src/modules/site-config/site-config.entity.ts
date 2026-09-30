import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity } from 'typeorm';
import { SiteConfigKey, SiteConfigType } from './site-config.constant';

@Entity('site_configs')
export class SiteConfig extends BaseEntity {
  @Column({ type: 'varchar', length: 64, unique: true })
  key: SiteConfigKey;

  @Column({ type: 'varchar', length: 32 })
  type: SiteConfigType;

  @Column({ type: 'text' })
  value: string;
}
