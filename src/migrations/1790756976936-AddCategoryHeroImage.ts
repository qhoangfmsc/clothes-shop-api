import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryHeroImage1790756976936 implements MigrationInterface {
  name = 'AddCategoryHeroImage1790756976936';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "categories" ADD COLUMN "hero_image" character varying(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "hero_image"`);
  }
}
