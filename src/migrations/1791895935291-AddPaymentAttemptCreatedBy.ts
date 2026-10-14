import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `payment_attempts.created_by`: admin tạo mã QR cho đơn (khách thanh toán tại cửa hàng); NULL = khách tự tạo.
 * Idempotent (IF NOT EXISTS, constraint được đặt lại).
 */
export class AddPaymentAttemptCreatedBy1791895935291 implements MigrationInterface {
  name = 'AddPaymentAttemptCreatedBy1791895935291';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_attempts" ADD COLUMN IF NOT EXISTS "created_by" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT IF EXISTS "FK_payment_attempts_created_by"`);
    await queryRunner.query(
      `ALTER TABLE "payment_attempts" ADD CONSTRAINT "FK_payment_attempts_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_attempts_created_by" ON "payment_attempts" ("created_by")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_attempts_created_by"`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT IF EXISTS "FK_payment_attempts_created_by"`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" DROP COLUMN IF EXISTS "created_by"`);
  }
}
