import { throwAppError } from '@common/exceptions/app.exception';
import { ESiteConfigErrorCode } from '@common/exceptions/error-codes';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SITE_CONFIG_KEY_TYPE, SiteConfigKey } from './site-config.constant';
import { SiteConfig } from './site-config.entity';

@Injectable()
export class SiteConfigService {
  constructor(
    @InjectRepository(SiteConfig)
    private readonly siteConfigRepo: Repository<SiteConfig>,
  ) {}

  // ============================================
  // PUBLIC METHODS
  // ============================================

  async findOnePublic(key: SiteConfigKey) {
    const config = await this.siteConfigRepo.findOne({ where: { key } });
    return { data: config ?? null };
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  /** Danh sách tất cả key khả dụng (kể cả chưa được cấu hình) — để admin FE build form */
  listAvailableKeys() {
    const data = Object.values(SiteConfigKey).map((key) => ({
      key,
      type: SITE_CONFIG_KEY_TYPE[key],
    }));
    return { data };
  }

  async findAllAdmin() {
    const data = await this.siteConfigRepo.find({ order: { key: 'ASC' } });
    return { data, total: data.length };
  }

  /** Create-or-update theo key. Type luôn suy ra từ key, admin chỉ cần truyền value. */
  async upsert(key: string, value: string) {
    if (!Object.values(SiteConfigKey).includes(key as SiteConfigKey)) {
      throwAppError(ESiteConfigErrorCode.SITE_CONFIG_KEY_INVALID);
    }
    const type = SITE_CONFIG_KEY_TYPE[key as SiteConfigKey];

    // NOTE: intentionally NOT using repo.upsert() here — it issues a raw
    // INSERT ... ON CONFLICT and bypasses TypeORM entity lifecycle hooks,
    // so BaseEntity's @BeforeInsert() id generator never runs and inserting
    // a never-before-configured key fails with a NOT NULL violation on "id".
    let config = await this.siteConfigRepo.findOne({ where: { key: key as SiteConfigKey } });
    if (config) {
      config.value = value;
      config.type = type;
    } else {
      config = this.siteConfigRepo.create({ key: key as SiteConfigKey, type, value });
    }

    return { data: await this.siteConfigRepo.save(config) };
  }

  async delete(key: string) {
    const config = await this.siteConfigRepo.findOne({ where: { key: key as SiteConfigKey } });
    if (!config) {
      throwAppError(ESiteConfigErrorCode.SITE_CONFIG_NOT_FOUND);
    }
    await this.siteConfigRepo.remove(config);
    return { message: 'Site config deleted successfully' };
  }
}
