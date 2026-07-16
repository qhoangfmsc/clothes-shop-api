import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixOrderUserFKAndIndexes1784193269892 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // H1: Fix orders.user_id NOT NULL vs SET NULL contradiction
    // Make user_id nullable so SET NULL works when user is deleted (preserve order history)
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_user"`);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "user_id" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // H6: Add missing FK indexes
    await queryRunner.query(`CREATE INDEX "IDX_cart_items_product_id" ON "cart_items" ("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_order_items_product_id" ON "order_items" ("product_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_product_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cart_items_product_id"`);

    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_user"`);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "user_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }
}
