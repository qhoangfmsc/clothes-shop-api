import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * priority trở thành thứ hạng duy nhất: 1 = ưu tiên cao nhất, số càng lớn càng thấp.
 * UNIQUE là DEFERRABLE để có thể dịch chuyển/hoán đổi nhiều dòng trong 1 transaction
 * (kiểm tra trùng lúc commit thay vì từng dòng).
 */
export class MakeCategoryPriorityUnique1791774171535 implements MigrationInterface {
  name = 'MakeCategoryPriorityUnique1791774171535';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Đánh số lại 1..N, giữ thứ tự hiện tại (priority cũ cao hơn đứng trước, bằng nhau thì theo created_at)
    await queryRunner.query(`
      UPDATE "categories" c SET "priority" = r.rn
      FROM (
        SELECT "id", ROW_NUMBER() OVER (ORDER BY "priority" DESC, "created_at" ASC, "id" ASC) AS rn
        FROM "categories"
      ) r
      WHERE c."id" = r."id"
    `);
    await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "priority" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "CHK_categories_priority"`);
    await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "CHK_categories_priority" CHECK ("priority" >= 1)`);
    await queryRunner.query(`DROP INDEX "IDX_categories_priority"`);
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "UQ_categories_priority" UNIQUE ("priority") DEFERRABLE INITIALLY DEFERRED`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "UQ_categories_priority"`);
    await queryRunner.query(`CREATE INDEX "IDX_categories_priority" ON "categories" ("priority")`);
    await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "CHK_categories_priority"`);
    await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "CHK_categories_priority" CHECK ("priority" >= 0)`);
    await queryRunner.query(`ALTER TABLE "categories" ALTER COLUMN "priority" SET DEFAULT 0`);
  }
}
