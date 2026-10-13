import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đơn đã thanh toán thì không còn "chờ xác nhận": từ nay thanh toán thành công tự chuyển `pending` → `confirmed`.
 * Migration này áp quy tắc đó cho các đơn đã `paid` từ trước mà còn `pending`.
 *
 * Idempotent. Không có `down` ý nghĩa (không biết đơn nào từng là `pending`), nên `down` để trống.
 */
export class ConfirmPaidPendingOrders1791872292172 implements MigrationInterface {
  name = 'ConfirmPaidPendingOrders1791872292172';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "orders" SET "status" = 'confirmed' WHERE "payment_status" = 'paid' AND "status" = 'pending'`);
  }

  public async down(): Promise<void> {
    // intentionally empty
  }
}
