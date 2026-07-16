import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCheckConstraints1784191427030 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // PRODUCTS
    // ============================================
    await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "CK_products_price_positive" CHECK ("price" > 0)`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CK_products_original_price" CHECK ("original_price" IS NULL OR "original_price" >= "price")`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CK_products_status" CHECK ("status" IN ('active', 'disabled'))`,
    );
    // Indexes cho FK columns mới
    await queryRunner.query(`CREATE INDEX "IDX_products_category_id" ON "products" ("category_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_subcategory_id" ON "products" ("subcategory_id")`);

    // ============================================
    // USERS
    // ============================================
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CK_users_role" CHECK ("role" IN ('user', 'admin'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CK_users_status" CHECK ("status" IN ('active', 'disabled'))`,
    );

    // ============================================
    // ORDERS
    // ============================================
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_status" CHECK ("status" IN ('pending', 'confirmed', 'shipping', 'delivered', 'completed', 'cancelled'))`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_subtotal" CHECK ("subtotal" >= 0)`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_shipping_fee" CHECK ("shipping_fee" >= 0)`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_total" CHECK ("total" >= 0)`);

    // ============================================
    // ORDER ITEMS
    // ============================================
    await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "CK_order_items_price" CHECK ("price" >= 0)`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "CK_order_items_quantity" CHECK ("quantity" >= 1)`);

    // ============================================
    // SUBCATEGORIES — unique slug per category
    // ============================================
    await queryRunner.query(
      `ALTER TABLE "subcategories" ADD CONSTRAINT "UQ_subcategories_category_slug" UNIQUE ("category_id", "slug")`,
    );

    // ============================================
    // COLLECTION PRODUCTS — index
    // ============================================
    await queryRunner.query(`CREATE INDEX "IDX_cp_product_id" ON "collection_products" ("product_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Collection products
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cp_product_id"`);

    // Subcategories
    await queryRunner.query(`ALTER TABLE "subcategories" DROP CONSTRAINT IF EXISTS "UQ_subcategories_category_slug"`);

    // Order items
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "CK_order_items_quantity"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "CK_order_items_price"`);

    // Orders
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_total"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_shipping_fee"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_subtotal"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_status"`);

    // Users
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CK_users_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CK_users_role"`);

    // Products
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_subcategory_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_category_id"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CK_products_status"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CK_products_original_price"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CK_products_price_positive"`);
  }
}
