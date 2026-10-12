import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryPriority1791773424311 implements MigrationInterface {
  name = 'AddCategoryPriority1791773424311';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN "priority" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "CHK_categories_priority" CHECK ("priority" >= 0)`);
    await queryRunner.query(`CREATE INDEX "IDX_categories_priority" ON "categories" ("priority")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_categories_priority"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "CHK_categories_priority"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "priority"`);
  }
}
