import { MigrationInterface, QueryRunner } from 'typeorm';
import { customAlphabet } from 'nanoid';

const nanoid16 = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16);

/**
 * Adds `site_configs` — a simple key/type/value store for FE-configurable
 * page content (banners, etc). `value` is always a string (JSON.stringify'd
 * by the caller); BE does not interpret its shape.
 *
 * Seeds the 4 registered keys (must match `SiteConfigKey` in
 * site-config.constant.ts) with an empty array value so the table is never
 * missing a row for a known key — the registry is BE-owned: new keys are
 * always added here first, FE cannot invent one on its own.
 *
 * Hand-written (not `migration:generate`): the live DB has schema drift
 * from unrelated prior changes, so an auto-diff would also touch many
 * unrelated constraints. This migration only adds the new table.
 */
export class AddSiteConfig1790752616083 implements MigrationInterface {
  name = 'AddSiteConfig1790752616083';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "site_configs" (
        "id" character varying(16) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "key" character varying(64) NOT NULL,
        "type" character varying(32) NOT NULL,
        "value" text NOT NULL,
        CONSTRAINT "UQ_site_configs_key" UNIQUE ("key"),
        CONSTRAINT "PK_site_configs" PRIMARY KEY ("id"),
        CONSTRAINT "CK_site_configs_type" CHECK ("type" IN ('BANNER', 'TEXT'))
      )
    `);

    const seedKeys = ['SHOP_HERO_BANNERS', 'NEW_IN_HERO_BANNERS', 'COLLECTIONS_HERO_BANNERS', 'NAV_MENU_BANNERS'];

    for (const key of seedKeys) {
      await queryRunner.query(`
        INSERT INTO "site_configs" ("id", "key", "type", "value")
        VALUES ('${nanoid16()}', '${key}', 'BANNER', '[]')
        ON CONFLICT ("key") DO NOTHING
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "site_configs"`);
  }
}
