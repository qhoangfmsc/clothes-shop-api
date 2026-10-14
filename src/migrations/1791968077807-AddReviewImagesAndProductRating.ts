import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ảnh trong đánh giá và điểm đánh giá trên sản phẩm:
 * - `media_files.purpose` (`LIBRARY` thư viện admin | `REVIEW` ảnh khách đính vào đánh giá) + `uploaded_by`: ảnh khách upload không lẫn vào thư viện admin,
 *   và đánh giá chỉ nhận ảnh chính chủ đã upload
 * - `reviews.images`: mảng URL ảnh (jsonb, tối đa 5)
 * - `products.rating_average` / `rating_count`: số lưu sẵn từ các đánh giá `PUBLISHED` (để sort/lọc sản phẩm theo sao), điền lại cho dữ liệu cũ
 *
 * Idempotent (IF NOT EXISTS, constraint được đặt lại): chạy đúng trên DB sạch và khi chạy lại.
 */
export class AddReviewImagesAndProductRating1791968077807 implements MigrationInterface {
  name = 'AddReviewImagesAndProductRating1791968077807';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- media_files
    await queryRunner.query(`
      ALTER TABLE "media_files"
        ADD COLUMN IF NOT EXISTS "purpose" character varying(10) NOT NULL DEFAULT 'LIBRARY',
        ADD COLUMN IF NOT EXISTS "uploaded_by" character varying(16)
    `);
    for (const name of ['FK_media_files_uploaded_by', 'CK_media_files_purpose']) {
      await queryRunner.query(`ALTER TABLE "media_files" DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    await queryRunner.query(
      `ALTER TABLE "media_files" ADD CONSTRAINT "FK_media_files_uploaded_by" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`ALTER TABLE "media_files" ADD CONSTRAINT "CK_media_files_purpose" CHECK ("purpose" IN ('LIBRARY', 'REVIEW'))`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_media_files_uploaded_by_purpose_created" ON "media_files" ("uploaded_by", "purpose", "created_at")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_media_files_purpose" ON "media_files" ("purpose")`);

    // --- reviews.images
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "images" jsonb NOT NULL DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "CK_reviews_images"`);
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "CK_reviews_images" CHECK (jsonb_typeof("images") = 'array' AND jsonb_array_length("images") <= 5)`,
    );

    // --- products.rating_*
    await queryRunner.query(`
      ALTER TABLE "products"
        ADD COLUMN IF NOT EXISTS "rating_average" numeric(2,1),
        ADD COLUMN IF NOT EXISTS "rating_count" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "products" p SET "rating_count" = s."count", "rating_average" = s."average"
      FROM (
        SELECT p2."id", COUNT(r."id")::int AS "count", ROUND(AVG(r."rating")::numeric, 1) AS "average"
        FROM "products" p2 LEFT JOIN "reviews" r ON r."product_id" = p2."id" AND r."status" = 'PUBLISHED'
        GROUP BY p2."id"
      ) s
      WHERE p."id" = s."id"
    `);
    for (const name of ['CK_products_rating_average', 'CK_products_rating_count', 'CK_products_rating_pair']) {
      await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CK_products_rating_average" CHECK ("rating_average" IS NULL OR ("rating_average" >= 1 AND "rating_average" <= 5))`,
    );
    await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "CK_products_rating_count" CHECK ("rating_count" >= 0)`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "CK_products_rating_pair" CHECK (("rating_count" = 0) = ("rating_average" IS NULL))`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_products_rating_average" ON "products" ("rating_average")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Không bỏ được nếu đã có ảnh đánh giá của khách: đó là nội dung người dùng, không được tự xoá
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "media_files" WHERE "purpose" = 'REVIEW')
           OR EXISTS (SELECT 1 FROM "reviews" WHERE jsonb_array_length("images") > 0) THEN
          RAISE EXCEPTION 'Cannot revert AddReviewImagesAndProductRating: review images exist';
        END IF;
      END
      $$
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_rating_average"`);
    for (const name of ['CK_products_rating_pair', 'CK_products_rating_count', 'CK_products_rating_average']) {
      await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "rating_count", DROP COLUMN IF EXISTS "rating_average"`);

    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "CK_reviews_images"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN IF EXISTS "images"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_files_purpose"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_files_uploaded_by_purpose_created"`);
    await queryRunner.query(`ALTER TABLE "media_files" DROP CONSTRAINT IF EXISTS "CK_media_files_purpose"`);
    await queryRunner.query(`ALTER TABLE "media_files" DROP CONSTRAINT IF EXISTS "FK_media_files_uploaded_by"`);
    await queryRunner.query(`ALTER TABLE "media_files" DROP COLUMN IF EXISTS "uploaded_by", DROP COLUMN IF EXISTS "purpose"`);
  }
}
