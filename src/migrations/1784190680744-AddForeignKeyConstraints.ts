import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddForeignKeyConstraints1784190680744 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // 1. PRODUCT → CATEGORY + SUBCATEGORY (FK)
    // ============================================

    // 1a. Add new FK columns (nullable temporarily)
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "category_id" VARCHAR(16)`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "subcategory_id" INT`);

    // 1b. Populate FK from existing slug data
    await queryRunner.query(`
      UPDATE "products" p
      SET "category_id" = c."id"
      FROM "categories" c
      WHERE p."category" = c."slug"
    `);

    await queryRunner.query(`
      UPDATE "products" p
      SET "subcategory_id" = sc."id"
      FROM "subcategories" sc
      JOIN "categories" c ON sc."category_id" = c."id"
      WHERE p."subcategory" = sc."slug" AND p."category" = c."slug"
    `);

    // 1c. Add FK constraints (RESTRICT — cannot delete Category/SubCategory if products exist)
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "category_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_products_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_products_subcategory" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE RESTRICT`,
    );

    // 1d. Drop old slug columns and indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_subcategory"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "category"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "subcategory"`);

    // ============================================
    // 2. REVIEW → PRODUCT (FK)
    // ============================================
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_reviews_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE`,
    );

    // ============================================
    // 3. COLLECTION ↔ PRODUCT (Many-to-Many junction table)
    // ============================================

    // 3a. Create junction table
    await queryRunner.query(`
      CREATE TABLE "collection_products" (
        "collection_id" VARCHAR(16) NOT NULL,
        "product_id" VARCHAR(16) NOT NULL,
        PRIMARY KEY ("collection_id", "product_id"),
        CONSTRAINT "FK_cp_collection" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cp_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // 3b. Migrate data from jsonb product_ids array
    await queryRunner.query(`
      INSERT INTO "collection_products" ("collection_id", "product_id")
      SELECT c."id", p.value::text
      FROM "collections" c, jsonb_array_elements_text(c."product_ids") p("value")
    `);

    // 3c. Drop old jsonb column
    await queryRunner.query(`ALTER TABLE "collections" DROP COLUMN "product_ids"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Collection — restore product_ids jsonb
    await queryRunner.query(`ALTER TABLE "collections" ADD COLUMN "product_ids" JSONB NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`
      UPDATE "collections" c
      SET "product_ids" = COALESCE(
        (SELECT jsonb_agg(cp."product_id") FROM "collection_products" cp WHERE cp."collection_id" = c."id"),
        '[]'::jsonb
      )
    `);
    await queryRunner.query(`DROP TABLE "collection_products"`);

    // Review
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_reviews_product"`);

    // Product — restore old columns
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "category" VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "subcategory" VARCHAR(100)`);
    await queryRunner.query(`
      UPDATE "products" p
      SET "category" = c."slug"
      FROM "categories" c
      WHERE p."category_id" = c."id"
    `);
    await queryRunner.query(`
      UPDATE "products" p
      SET "subcategory" = sc."slug"
      FROM "subcategories" sc
      WHERE p."subcategory_id" = sc."id"
    `);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_products_subcategory"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_products_category"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "subcategory_id"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "category_id"`);
  }
}
