import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hoàn tiền cho đơn đã thanh toán:
 * - `orders.payment_status` thêm giá trị `refunded` (đã trả rồi hoàn xong); `paid_at` giữ lại thời điểm đã trả nên
 *   `CK_orders_paid_at` thành `(payment_status IN ('paid', 'refunded')) = (paid_at IS NOT NULL)`
 * - bảng `refunds`: yêu cầu hoàn (REQUESTED → COMPLETED | REJECTED); hệ thống không tự chuyển tiền, admin chuyển khoản rồi ghi `bank_reference`
 *
 * Idempotent (IF NOT EXISTS, constraint được đặt lại): chạy đúng trên DB sạch và khi chạy lại.
 * Không backfill: đơn đã huỷ mà đã thu tiền từ trước được admin tạo yêu cầu hoàn bằng `POST /api/admin/refunds`.
 */
export class AddRefunds1791879846109 implements MigrationInterface {
  name = 'AddRefunds1791879846109';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_paid_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_payment_status"`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_payment_status" CHECK ("payment_status" IN ('unpaid', 'paid', 'refunded'))`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_paid_at" CHECK (("payment_status" IN ('paid', 'refunded')) = ("paid_at" IS NOT NULL))`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refunds" (
        "id" character varying(16) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "order_id" character varying(16) NOT NULL,
        "payment_attempt_id" character varying(16) NOT NULL,
        "amount" bigint NOT NULL,
        "status" character varying(10) NOT NULL DEFAULT 'REQUESTED',
        "reason" character varying(20) NOT NULL,
        "requested_by" character varying(16),
        "processed_by" character varying(16),
        "processed_at" TIMESTAMP WITH TIME ZONE,
        "bank_reference" character varying(64),
        "note" character varying(500),
        CONSTRAINT "PK_refunds" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refunds_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_refunds_payment_attempt" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_refunds_requested_by" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_refunds_processed_by" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "CK_refunds_amount" CHECK ("amount" > 0),
        CONSTRAINT "CK_refunds_status" CHECK ("status" IN ('REQUESTED', 'COMPLETED', 'REJECTED')),
        CONSTRAINT "CK_refunds_reason" CHECK ("reason" IN ('ADMIN_CANCELLED')),
        CONSTRAINT "CK_refunds_processed_at" CHECK (("status" = 'REQUESTED') = ("processed_at" IS NULL)),
        CONSTRAINT "CK_refunds_completed_reference" CHECK ("status" <> 'COMPLETED' OR "bank_reference" IS NOT NULL)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refunds_order_id" ON "refunds" ("order_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refunds_payment_attempt_id" ON "refunds" ("payment_attempt_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refunds_status" ON "refunds" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refunds_created_at" ON "refunds" ("created_at" DESC)`);
    // Mỗi đơn tối đa một yêu cầu đang chờ; một mã giao dịch ngân hàng chỉ dùng cho một khoản hoàn
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_refunds_order_requested" ON "refunds" ("order_id") WHERE "status" = 'REQUESTED'`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_refunds_bank_reference" ON "refunds" ("bank_reference") WHERE "bank_reference" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refunds"`);

    // `refunded` không còn hợp lệ: các đơn đó quay về `paid` (vẫn còn `paid_at`)
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_paid_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_payment_status"`);
    await queryRunner.query(`UPDATE "orders" SET "payment_status" = 'paid' WHERE "payment_status" = 'refunded'`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_payment_status" CHECK ("payment_status" IN ('unpaid', 'paid'))`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_paid_at" CHECK (("payment_status" = 'paid') = ("paid_at" IS NOT NULL))`);
  }
}
