import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trả hàng sau khi giao:
 * - `orders.delivered_at`: lúc đơn sang `delivered` (mốc tính hạn đổi trả). Đơn đã `delivered`/`completed` từ trước được điền bằng
 *   `updated_at` (xấp xỉ: không có dữ liệu chính xác hơn); CHECK bắt buộc có giá trị khi đơn đã giao
 * - `return_requests` / `return_request_items`: yêu cầu trả hàng và các dòng hàng xin trả
 * - `refunds.return_request_id` + lý do `RETURN`: khoản hoàn sinh ra từ yêu cầu trả hàng
 * - cấp RETURN_CREATE (15000) / RETURN_VIEW (15001) cho user đã có ORDER_CREATE (3002) / ORDER_VIEW_DETAIL (3001)
 *
 * Idempotent (IF NOT EXISTS, constraint được đặt lại): chạy đúng trên DB sạch và khi chạy lại.
 */
export class AddReturns1791884003973 implements MigrationInterface {
  name = 'AddReturns1791884003973';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- orders.delivered_at
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`UPDATE "orders" SET "delivered_at" = "updated_at" WHERE "status" IN ('delivered', 'completed') AND "delivered_at" IS NULL`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_delivered_at"`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_delivered_at" CHECK ("status" NOT IN ('delivered', 'completed') OR "delivered_at" IS NOT NULL)`,
    );

    // --- return_requests
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "return_requests" (
        "id" character varying(16) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "order_id" character varying(16) NOT NULL,
        "status" character varying(10) NOT NULL DEFAULT 'REQUESTED',
        "reason" character varying(20) NOT NULL,
        "note" character varying(500) NOT NULL DEFAULT '',
        "admin_note" character varying(500),
        "requested_by" character varying(16),
        "processed_by" character varying(16),
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "received_at" TIMESTAMP WITH TIME ZONE,
        "shipping_refunded" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_return_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_return_requests_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_return_requests_requested_by" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_return_requests_processed_by" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CK_return_requests_status" CHECK ("status" IN ('REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED')),
        CONSTRAINT "CK_return_requests_reason" CHECK ("reason" IN ('WRONG_SIZE', 'CHANGED_MIND', 'DEFECTIVE', 'WRONG_ITEM', 'OTHER'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_return_requests_order_id" ON "return_requests" ("order_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_return_requests_status" ON "return_requests" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_return_requests_created_at" ON "return_requests" ("created_at" DESC)`);

    // --- return_request_items
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "return_request_items" (
        "id" character varying(16) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "return_request_id" character varying(16) NOT NULL,
        "order_item_id" character varying(16) NOT NULL,
        "quantity" integer NOT NULL,
        "accepted_quantity" integer,
        CONSTRAINT "PK_return_request_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_return_request_items_request_and_item" UNIQUE ("return_request_id", "order_item_id"),
        CONSTRAINT "FK_return_request_items_request" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_return_request_items_order_item" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT,
        CONSTRAINT "CK_return_request_items_quantity" CHECK ("quantity" >= 1),
        CONSTRAINT "CK_return_request_items_accepted" CHECK ("accepted_quantity" IS NULL OR ("accepted_quantity" >= 0 AND "accepted_quantity" <= "quantity"))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_return_request_items_order_item_id" ON "return_request_items" ("order_item_id")`);

    // --- refunds: khoản hoàn của yêu cầu trả hàng
    await queryRunner.query(`ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "return_request_id" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "FK_refunds_return_request"`);
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "FK_refunds_return_request" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refunds_return_request_id" ON "refunds" ("return_request_id")`);
    await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "CK_refunds_reason"`);
    await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "CK_refunds_return_request"`);
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "CK_refunds_reason" CHECK ("reason" IN ('ADMIN_CANCELLED', 'RETURN'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "CK_refunds_return_request" CHECK (("reason" = 'RETURN') = ("return_request_id" IS NOT NULL))`,
    );

    // --- quyền
    await queryRunner.query(`
      UPDATE "users" SET "permissions" = "permissions" || '[15000]'::jsonb
      WHERE "role" = 'user' AND "permissions" @> '[3002]'::jsonb AND NOT ("permissions" @> '[15000]'::jsonb)
    `);
    await queryRunner.query(`
      UPDATE "users" SET "permissions" = "permissions" || '[15001]'::jsonb
      WHERE "role" = 'user' AND "permissions" @> '[3001]'::jsonb AND NOT ("permissions" @> '[15001]'::jsonb)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Không bỏ được nếu đã có khoản hoàn từ yêu cầu trả hàng: đó là bằng chứng tiền, không được tự xoá hay đổi lý do
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "refunds" WHERE "reason" = 'RETURN') THEN
          RAISE EXCEPTION 'Cannot revert AddReturns: refunds created from return requests exist';
        END IF;
      END
      $$
    `);
    await queryRunner.query(`
      UPDATE "users" SET "permissions" = COALESCE(
        (SELECT jsonb_agg(p) FROM jsonb_array_elements("permissions") p WHERE p NOT IN ('15000'::jsonb, '15001'::jsonb)),
        '[]'::jsonb
      )
      WHERE "permissions" @> '[15000]'::jsonb OR "permissions" @> '[15001]'::jsonb
    `);

    await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "CK_refunds_return_request"`);
    await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "CK_refunds_reason"`);
    await queryRunner.query(`ALTER TABLE "refunds" ADD CONSTRAINT "CK_refunds_reason" CHECK ("reason" IN ('ADMIN_CANCELLED'))`);
    await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "FK_refunds_return_request"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refunds_return_request_id"`);
    await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN IF EXISTS "return_request_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "return_request_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "return_requests"`);

    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_delivered_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivered_at"`);
  }
}
