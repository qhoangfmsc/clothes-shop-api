import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mã giao dịch được lưu và hiển thị đúng một giá trị ở mọi nơi (DB, admin, khách):
 * - bỏ tiền tố nội bộ `manual:` ở giao dịch admin tự nhập (cột `provider = 'manual'` đã phân biệt nguồn)
 * - UNIQUE chuyển từ `provider_transaction_id` sang cặp (`provider`, `provider_transaction_id`)
 *   để mã của nguồn `manual` không đụng mã số của SePay
 *
 * Idempotent: chạy lại không lỗi.
 */
export class PaymentTransactionUniquePerProvider1791865521461 implements MigrationInterface {
  name = 'PaymentTransactionUniquePerProvider1791865521461';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "UQ_payment_transactions_provider_transaction_id"`);
    await queryRunner.query(`
      UPDATE "payment_transactions" SET "provider_transaction_id" = substr("provider_transaction_id", 8)
      WHERE "provider" = 'manual' AND "provider_transaction_id" LIKE 'manual:%'
    `);
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "UQ_payment_transactions_provider_and_transaction_id"`);
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD CONSTRAINT "UQ_payment_transactions_provider_and_transaction_id" UNIQUE ("provider", "provider_transaction_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "UQ_payment_transactions_provider_and_transaction_id"`);
    await queryRunner.query(`
      UPDATE "payment_transactions" SET "provider_transaction_id" = 'manual:' || "provider_transaction_id"
      WHERE "provider" = 'manual' AND "provider_transaction_id" NOT LIKE 'manual:%'
    `);
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD CONSTRAINT "UQ_payment_transactions_provider_transaction_id" UNIQUE ("provider_transaction_id")`,
    );
  }
}
