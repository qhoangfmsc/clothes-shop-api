import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đánh giá sản phẩm có người viết thật:
 * - `reviews`: gắn với dòng hàng đã mua (`order_item_id`, UNIQUE: mỗi dòng hàng một đánh giá), snapshot `size`/`color`, `fit`,
 *   trạng thái kiểm duyệt (`status`, `moderation_note`, `moderated_by/at`), `helpful_count`, sửa một lần (`edited_at`),
 *   phản hồi của cửa hàng (`reply`, `replied_by/at`). Dòng seed cũ giữ nguyên, mặc định `PUBLISHED`
 * - `review_votes`: mỗi user một lượt "hữu ích" cho một đánh giá
 * - cấp REVIEW_CREATE (17000) / REVIEW_VIEW (17001) / REVIEW_VOTE (17002) cho user đã có ORDER_CREATE (3002)
 *
 * Idempotent (IF NOT EXISTS, constraint được đặt lại): chạy đúng trên DB sạch và khi chạy lại.
 */
export class AddReviewFeatures1791966947507 implements MigrationInterface {
  name = 'AddReviewFeatures1791966947507';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- reviews: cột mới
    await queryRunner.query(`
      ALTER TABLE "reviews"
        ADD COLUMN IF NOT EXISTS "order_item_id" character varying(16),
        ADD COLUMN IF NOT EXISTS "size" character varying(50) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "color" character varying(100) NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "fit" character varying(20),
        ADD COLUMN IF NOT EXISTS "status" character varying(10) NOT NULL DEFAULT 'PUBLISHED',
        ADD COLUMN IF NOT EXISTS "helpful_count" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "moderation_note" character varying(500),
        ADD COLUMN IF NOT EXISTS "moderated_by" character varying(16),
        ADD COLUMN IF NOT EXISTS "moderated_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "reply" character varying(1000),
        ADD COLUMN IF NOT EXISTS "replied_by" character varying(16),
        ADD COLUMN IF NOT EXISTS "replied_at" TIMESTAMP WITH TIME ZONE
    `);

    // --- reviews: constraint
    for (const name of [
      'FK_reviews_order_item',
      'FK_reviews_moderated_by',
      'FK_reviews_replied_by',
      'UQ_reviews_order_item_id',
      'CK_reviews_status',
      'CK_reviews_fit',
      'CK_reviews_helpful_count',
      'CK_reviews_hidden_note',
      'CK_reviews_reply',
    ]) {
      await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_reviews_order_item" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_reviews_moderated_by" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_reviews_replied_by" FOREIGN KEY ("replied_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "UQ_reviews_order_item_id" UNIQUE ("order_item_id")`);
    await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "CK_reviews_status" CHECK ("status" IN ('PUBLISHED', 'HIDDEN'))`);
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "CK_reviews_fit" CHECK ("fit" IS NULL OR "fit" IN ('small', 'true_to_size', 'large'))`,
    );
    await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "CK_reviews_helpful_count" CHECK ("helpful_count" >= 0)`);
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "CK_reviews_hidden_note" CHECK ("status" <> 'HIDDEN' OR "moderation_note" IS NOT NULL)`,
    );
    await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "CK_reviews_reply" CHECK (("reply" IS NULL) = ("replied_at" IS NULL))`);

    // --- reviews: index
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviews_status" ON "reviews" ("status")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reviews_product_status_created" ON "reviews" ("product_id", "status", "created_at" DESC)`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviews_moderated_by" ON "reviews" ("moderated_by")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_reviews_replied_by" ON "reviews" ("replied_by")`);

    // --- review_votes
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "review_votes" (
        "id" character varying(16) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "review_id" character varying(16) NOT NULL,
        "user_id" character varying(16) NOT NULL,
        CONSTRAINT "PK_review_votes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_review_votes_review_user" UNIQUE ("review_id", "user_id"),
        CONSTRAINT "FK_review_votes_review" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_votes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_review_votes_user_id" ON "review_votes" ("user_id")`);

    // --- quyền
    for (const code of [17000, 17001, 17002]) {
      await queryRunner.query(`
        UPDATE "users" SET "permissions" = "permissions" || '[${code}]'::jsonb
        WHERE "role" = 'user' AND "permissions" @> '[3002]'::jsonb AND NOT ("permissions" @> '[${code}]'::jsonb)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Không bỏ được nếu đã có đánh giá của khách: đó là nội dung người dùng, không được tự xoá
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "reviews" WHERE "order_item_id" IS NOT NULL) THEN
          RAISE EXCEPTION 'Cannot revert AddReviewFeatures: reviews written by customers exist';
        END IF;
      END
      $$
    `);
    await queryRunner.query(`
      UPDATE "users" SET "permissions" = COALESCE(
        (SELECT jsonb_agg(p) FROM jsonb_array_elements("permissions") p WHERE p NOT IN ('17000'::jsonb, '17001'::jsonb, '17002'::jsonb)),
        '[]'::jsonb
      )
      WHERE "permissions" @> '[17000]'::jsonb OR "permissions" @> '[17001]'::jsonb OR "permissions" @> '[17002]'::jsonb
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "review_votes"`);

    for (const index of ['IDX_reviews_replied_by', 'IDX_reviews_moderated_by', 'IDX_reviews_product_status_created', 'IDX_reviews_status']) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${index}"`);
    }
    for (const name of [
      'CK_reviews_reply',
      'CK_reviews_hidden_note',
      'CK_reviews_helpful_count',
      'CK_reviews_fit',
      'CK_reviews_status',
      'UQ_reviews_order_item_id',
      'FK_reviews_replied_by',
      'FK_reviews_moderated_by',
      'FK_reviews_order_item',
    ]) {
      await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    await queryRunner.query(`
      ALTER TABLE "reviews"
        DROP COLUMN IF EXISTS "replied_at",
        DROP COLUMN IF EXISTS "replied_by",
        DROP COLUMN IF EXISTS "reply",
        DROP COLUMN IF EXISTS "moderated_at",
        DROP COLUMN IF EXISTS "moderated_by",
        DROP COLUMN IF EXISTS "moderation_note",
        DROP COLUMN IF EXISTS "edited_at",
        DROP COLUMN IF EXISTS "helpful_count",
        DROP COLUMN IF EXISTS "status",
        DROP COLUMN IF EXISTS "fit",
        DROP COLUMN IF EXISTS "color",
        DROP COLUMN IF EXISTS "size",
        DROP COLUMN IF EXISTS "order_item_id"
    `);
  }
}
