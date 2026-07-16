import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPermissions1784111460687 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Thêm cột permissions (JSONB) — mảng chứa mã permission
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '[]'`,
    );

    // Gán permissions mặc định cho tất cả user hiện có (role = 'user')
    // Admin không cần vì PermissionsGuard tự động bỏ qua role='admin'
    await queryRunner.query(`
      UPDATE "users"
      SET "permissions" = '[1000,1001,2000,2001,2002,2003,2004,3000,3001,3002,3003,4000,4001,4002,4003,5000,5001,5002,5003]'::jsonb
      WHERE "role" = 'user'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "permissions"`);
  }
}
