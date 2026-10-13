import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thanh toán VietQR + SePay webhook:
 * - `orders.payment_status` / `paid_at` (tách khỏi `orders.status` là luồng giao hàng)
 * - `payment_attempts`: phiên thanh toán (mã chuyển khoản duy nhất, số tiền VND, hạn QR)
 * - `payment_transactions`: giao dịch ngân hàng nhận từ SePay (kể cả không khớp, để đối soát)
 * - cấp PAYMENT_CREATE (13000) / PAYMENT_VIEW (13001) cho user đã có ORDER_CREATE (3002) / ORDER_VIEW_DETAIL (3001)
 *
 * Hand-written (not `migration:generate`) — live DB has schema drift, see AddSiteConfig migration.
 *
 * Idempotent / hội tụ: chạy đúng trên DB sạch, DB đã có sẵn một phần (cột/bảng/constraint cùng tên) và khi chạy lại.
 * Một lần thử cũ (migration `AddPayments1791819274413`, file đã bị xoá) để lại `orders.payment_status` kiểu
 * `PENDING|PAID` varchar(20) và bảng `payment_transactions` dạng cũ (`order_id`, `transaction_id`, `currency`, ...):
 * - `orders`: giá trị cũ được đổi sang `unpaid|paid`, kiểu/default/CHECK được đặt lại theo chuẩn hiện tại
 * - `payment_transactions` dạng cũ: dữ liệu (nếu có) được sao sang `payment_transactions_legacy` rồi bảng cũ bị thay bằng bảng mới
 */
export class AddPayments1791824744900 implements MigrationInterface {
  name = 'AddPayments1791824744900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- orders: thêm cột nếu chưa có, rồi chuẩn hoá về unpaid|paid bất kể trạng thái trước đó
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_status" character varying(10) NOT NULL DEFAULT 'unpaid'`);
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_paid_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_payment_status"`);
    // Giá trị cũ (PENDING/PAID, hoa/thường) → unpaid|paid; đơn paid mà thiếu paid_at lấy updated_at, đơn unpaid không có paid_at
    await queryRunner.query(`
      UPDATE "orders" SET "payment_status" = CASE WHEN lower("payment_status") = 'paid' THEN 'paid' ELSE 'unpaid' END
      WHERE "payment_status" NOT IN ('paid', 'unpaid')
    `);
    await queryRunner.query(`UPDATE "orders" SET "paid_at" = COALESCE("paid_at", "updated_at") WHERE "payment_status" = 'paid' AND "paid_at" IS NULL`);
    await queryRunner.query(`UPDATE "orders" SET "paid_at" = NULL WHERE "payment_status" = 'unpaid' AND "paid_at" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE character varying(10)`);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'unpaid'`);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "payment_status" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_payment_status" CHECK ("payment_status" IN ('unpaid', 'paid'))`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_paid_at" CHECK (("payment_status" = 'paid') = ("paid_at" IS NOT NULL))`,
    );

    // --- payment_transactions dạng cũ (không có provider_transaction_id): lưu bản sao nếu có dữ liệu rồi bỏ để tạo bảng mới
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions')
           AND NOT EXISTS (
             SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'provider_transaction_id'
           ) THEN
          IF EXISTS (SELECT 1 FROM "payment_transactions") THEN
            CREATE TABLE IF NOT EXISTS "payment_transactions_legacy" AS SELECT * FROM "payment_transactions";
          END IF;
          DROP TABLE IF EXISTS "payment_transactions";
        END IF;
      END
      $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_attempts" (
        "id" character varying(16) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "order_id" character varying(16) NOT NULL,
        "transfer_code" character varying(32) NOT NULL,
        "amount" bigint NOT NULL,
        "bank_account" character varying(50) NOT NULL,
        "status" character varying(10) NOT NULL DEFAULT 'PENDING',
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_payment_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_attempts_transfer_code" UNIQUE ("transfer_code"),
        CONSTRAINT "FK_payment_attempts_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
        CONSTRAINT "CK_payment_attempts_amount" CHECK ("amount" > 0),
        CONSTRAINT "CK_payment_attempts_status" CHECK ("status" IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED')),
        CONSTRAINT "CK_payment_attempts_paid_at" CHECK (("status" = 'PAID') = ("paid_at" IS NOT NULL))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_attempts_order_id" ON "payment_attempts" ("order_id")`);
    // Mỗi đơn tối đa 1 phiên đang chờ và 1 phiên đã trả
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payment_attempts_order_pending" ON "payment_attempts" ("order_id") WHERE "status" = 'PENDING'`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payment_attempts_order_paid" ON "payment_attempts" ("order_id") WHERE "status" = 'PAID'`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_transactions" (
        "id" character varying(16) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "payment_attempt_id" character varying(16),
        "provider_transaction_id" character varying(64) NOT NULL,
        "provider" character varying(20) NOT NULL DEFAULT 'sepay',
        "amount" bigint NOT NULL,
        "transfer_content" character varying(500) NOT NULL DEFAULT '',
        "raw_payload" jsonb NOT NULL,
        "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "verification_status" character varying(20) NOT NULL,
        CONSTRAINT "PK_payment_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_transactions_provider_transaction_id" UNIQUE ("provider_transaction_id"),
        CONSTRAINT "FK_payment_transactions_attempt" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT,
        CONSTRAINT "CK_payment_transactions_amount" CHECK ("amount" >= 0),
        CONSTRAINT "CK_payment_transactions_verification_status" CHECK ("verification_status" IN ('MATCHED', 'UNMATCHED', 'ACCOUNT_MISMATCH', 'AMOUNT_MISMATCH', 'LATE', 'NOT_PAYABLE', 'DUPLICATE_PAYMENT', 'IGNORED'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_attempt_id" ON "payment_transactions" ("payment_attempt_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_verification_status" ON "payment_transactions" ("verification_status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_transactions_received_at" ON "payment_transactions" ("received_at" DESC)`);

    // User đã có quyền tạo/xem đơn thì có quyền thanh toán/xem trạng thái thanh toán tương ứng
    await queryRunner.query(`
      UPDATE "users" SET "permissions" = "permissions" || '[13000]'::jsonb
      WHERE "role" = 'user' AND "permissions" @> '[3002]'::jsonb AND NOT ("permissions" @> '[13000]'::jsonb)
    `);
    await queryRunner.query(`
      UPDATE "users" SET "permissions" = "permissions" || '[13001]'::jsonb
      WHERE "role" = 'user' AND "permissions" @> '[3001]'::jsonb AND NOT ("permissions" @> '[13001]'::jsonb)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" SET "permissions" = COALESCE(
        (SELECT jsonb_agg(p) FROM jsonb_array_elements("permissions") p WHERE p NOT IN ('13000'::jsonb, '13001'::jsonb)),
        '[]'::jsonb
      )
      WHERE "permissions" @> '[13000]'::jsonb OR "permissions" @> '[13001]'::jsonb
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "payment_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_attempts"`);

    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_paid_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_payment_status"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "paid_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_status"`);
  }
}
