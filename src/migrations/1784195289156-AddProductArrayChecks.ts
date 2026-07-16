import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductArrayChecks1784195289156 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Bảo vệ DB: không cho sizes/colors/images rỗng
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CK_products_sizes_not_empty" CHECK (jsonb_array_length("sizes") > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CK_products_colors_not_empty" CHECK (jsonb_array_length("colors") > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CK_products_images_not_empty" CHECK (jsonb_array_length("images") > 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CK_products_images_not_empty"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CK_products_colors_not_empty"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CK_products_sizes_not_empty"`);
  }
}
