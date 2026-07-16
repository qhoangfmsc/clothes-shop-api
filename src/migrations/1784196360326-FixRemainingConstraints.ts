import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixRemainingConstraints1784196360326 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // === Missing FK indexes ===
    await queryRunner.query(`CREATE INDEX "IDX_wishlists_product_id" ON "wishlists" ("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_subcategories_category_id" ON "subcategories" ("category_id")`);

    // === Cart items: prevent duplicate (cart, product, size, color) ===
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "UQ_cart_items_unique" UNIQUE ("cart_id", "product_id", "size", "color")`,
    );

    // === Cart items: upper bound on quantity ===
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "CK_cart_items_quantity_max" CHECK ("quantity" <= 99)`,
    );

    // === SubCategory count >= 0 ===
    await queryRunner.query(
      `ALTER TABLE "subcategories" ADD CONSTRAINT "CK_subcategories_count" CHECK ("count" >= 0)`,
    );

    // === Order items: price > 0 (match product price constraint) ===
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "CK_order_items_price_positive" CHECK ("price" > 0)`,
    );

    // === Products: subcategory_id NOT NULL (every product must have subcategory) ===
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "subcategory_id" SET NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "subcategory_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "CK_order_items_price_positive"`);
    await queryRunner.query(`ALTER TABLE "subcategories" DROP CONSTRAINT IF EXISTS "CK_subcategories_count"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "CK_cart_items_quantity_max"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "UQ_cart_items_unique"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subcategories_category_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wishlists_product_id"`);
  }
}
