import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductBadgeCheck1791788759258 implements MigrationInterface {
  name = 'AddProductBadgeCheck1791788759258';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Không tự xoá dữ liệu: nếu còn badge ngoài enum thì dừng và báo rõ để sửa tay trước
    await queryRunner.query(`
      DO $$
      DECLARE bad text;
      BEGIN
        SELECT string_agg(DISTINCT "badge", ', ') INTO bad
        FROM "products" WHERE "badge" IS NOT NULL AND "badge" NOT IN ('new', 'sale', 'bestseller');
        IF bad IS NOT NULL THEN
          RAISE EXCEPTION 'products.badge contains values outside (new, sale, bestseller): %', bad;
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CHK_products_badge" CHECK ("badge" IS NULL OR "badge" IN ('new', 'sale', 'bestseller'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "CHK_products_badge"`);
  }
}
