import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Xác nhận thanh toán thủ công của admin (khi webhook SePay không tới / lỗi nhưng tiền đã về):
 * - `payment_transactions.confirmed_by` / `confirmed_at` / `confirm_note` (ai xác nhận, lúc nào, lý do)
 * - `verification_status` thêm `MANUALLY_CONFIRMED`
 * - CHECK: có `confirmed_at` khi và chỉ khi `verification_status = MANUALLY_CONFIRMED`
 *
 * Idempotent: chạy lại không lỗi.
 */
export class AddPaymentConfirmation1791861660340 implements MigrationInterface {
  name = 'AddPaymentConfirmation1791861660340';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "confirmed_by" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "confirm_note" character varying(500)`);

    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "FK_payment_transactions_confirmed_by"`);
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_payment_transactions_confirmed_by" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "CK_payment_transactions_verification_status"`);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions" ADD CONSTRAINT "CK_payment_transactions_verification_status"
      CHECK ("verification_status" IN ('MATCHED', 'UNMATCHED', 'ACCOUNT_MISMATCH', 'AMOUNT_MISMATCH', 'LATE', 'NOT_PAYABLE', 'DUPLICATE_PAYMENT', 'IGNORED', 'MANUALLY_CONFIRMED'))
    `);
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "CK_payment_transactions_confirmed"`);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions" ADD CONSTRAINT "CK_payment_transactions_confirmed"
      CHECK (("verification_status" = 'MANUALLY_CONFIRMED') = ("confirmed_at" IS NOT NULL))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "CK_payment_transactions_confirmed"`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "CK_payment_transactions_verification_status"`);
    // Không còn giá trị MANUALLY_CONFIRMED sau khi hạ schema: coi như đã khớp (đơn đã được đánh dấu paid)
    await queryRunner.query(`UPDATE "payment_transactions" SET "verification_status" = 'MATCHED' WHERE "verification_status" = 'MANUALLY_CONFIRMED'`);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions" ADD CONSTRAINT "CK_payment_transactions_verification_status"
      CHECK ("verification_status" IN ('MATCHED', 'UNMATCHED', 'ACCOUNT_MISMATCH', 'AMOUNT_MISMATCH', 'LATE', 'NOT_PAYABLE', 'DUPLICATE_PAYMENT', 'IGNORED'))
    `);
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP CONSTRAINT IF EXISTS "FK_payment_transactions_confirmed_by"`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP COLUMN IF EXISTS "confirm_note"`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP COLUMN IF EXISTS "confirmed_at"`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP COLUMN IF EXISTS "confirmed_by"`);
  }
}
