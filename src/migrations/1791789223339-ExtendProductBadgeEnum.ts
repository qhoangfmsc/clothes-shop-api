import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendProductBadgeEnum1791789223339 implements MigrationInterface {
  name = 'ExtendProductBadgeEnum1791789223339';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Thêm sold_out, limited, custom_order vào enum badge; đồng thời đổi tên constraint theo prefix CK_ của project
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "CHK_products_badge"`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CK_products_badge" CHECK ("badge" IS NULL OR "badge" IN ('new', 'sale', 'bestseller', 'sold_out', 'limited', 'custom_order'))`,
    );
    await queryRunner.query(`ALTER TABLE "categories" RENAME CONSTRAINT "CHK_categories_priority" TO "CK_categories_priority"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "categories" RENAME CONSTRAINT "CK_categories_priority" TO "CHK_categories_priority"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "CK_products_badge"`);
    // Product đang dùng badge mới sẽ không thoả constraint cũ → đưa về NULL trước khi thu hẹp enum
    await queryRunner.query(`UPDATE "products" SET "badge" = NULL WHERE "badge" IN ('sold_out', 'limited', 'custom_order')`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CHK_products_badge" CHECK ("badge" IS NULL OR "badge" IN ('new', 'sale', 'bestseller'))`,
    );
  }
}
