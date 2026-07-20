import { customAlphabet } from 'nanoid';
import { MigrationInterface, QueryRunner } from 'typeorm';

const nanoid16 = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  16,
);

export class MigrateSubcategoryToNanoid1784520030511
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Lấy danh sách subcategories hiện tại ──
    const subcategories: { id: number; slug: string }[] =
      await queryRunner.query(`SELECT id, slug FROM "subcategories" ORDER BY id`);

    // Build map: old_id → new_nanoid16
    const idMap = new Map<number, string>();
    for (const sub of subcategories) {
      idMap.set(sub.id, nanoid16());
    }

    // ── 2. Lưu old_id để dùng cho down() migration ──
    await queryRunner.query(
      `ALTER TABLE "subcategories" ADD COLUMN "_old_id" INT`,
    );
    for (const [oldId] of idMap) {
      await queryRunner.query(
        `UPDATE "subcategories" SET "_old_id" = ${oldId} WHERE "id" = ${oldId}`,
      );
    }

    // ── 3. Drop FK constraint trên products ──
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_products_subcategory"`,
    );

    // ── 4. Thêm created_at, updated_at cho BaseEntity ──
    await queryRunner.query(
      `ALTER TABLE "subcategories" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "subcategories" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()`,
    );

    // ── 5. Thêm temporary column trên products để chứa nanoid ──
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "_new_subcategory_id" VARCHAR(16)`,
    );

    // ── 6. Map products.subcategory_id sang nanoid mới ──
    for (const [oldId, newId] of idMap) {
      await queryRunner.query(
        `UPDATE "products" SET "_new_subcategory_id" = '${newId}' WHERE "subcategory_id" = ${oldId}`,
      );
    }

    // ── 7. Đổi PK trên subcategories: SERIAL → VARCHAR(16) ──
    // Phải đổi kiểu column TRƯỚC rồi mới UPDATE giá trị nanoid
    // (PostgreSQL không cho UPDATE INT column = string)
    await queryRunner.query(
      `ALTER TABLE "subcategories" DROP CONSTRAINT "PK_subcategories"`,
    );
    // Bước 1: Đổi kiểu cột (các giá trị INT cũ → string "1", "2", ...)
    await queryRunner.query(
      `ALTER TABLE "subcategories" ALTER COLUMN "id" TYPE VARCHAR(16)`,
    );
    // Bước 2: UPDATE với nanoid mới (giờ column đã là VARCHAR)
    for (const [oldId, newId] of idMap) {
      await queryRunner.query(
        `UPDATE "subcategories" SET "id" = '${newId}' WHERE "id" = '${oldId}'`,
      );
    }
    // Bước 3: Add PK constraint trở lại
    await queryRunner.query(
      `ALTER TABLE "subcategories" ADD CONSTRAINT "PK_subcategories" PRIMARY KEY ("id")`,
    );

    // ── 8. Swap products.subcategory_id sang VARCHAR(16) ──
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN "subcategory_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" RENAME COLUMN "_new_subcategory_id" TO "subcategory_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "subcategory_id" SET NOT NULL`,
    );

    // ── 9. Re-add index TRƯỚC FK (để FK validation dùng index, không sequential scan) ──
    await queryRunner.query(
      `CREATE INDEX "IDX_products_subcategory_id" ON "products" ("subcategory_id")`,
    );

    // ── 10. Add FK constraint trở lại ──
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_products_subcategory" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE RESTRICT`,
    );

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Drop FK ──
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_products_subcategory"`,
    );

    // ── 2. Lấy mapping ngược từ _old_id ──
    const subcategories: { id: string; _old_id: number }[] =
      await queryRunner.query(
        `SELECT id, "_old_id" FROM "subcategories"`,
      );

    const reverseMap = new Map<string, number>();
    for (const sub of subcategories) {
      if (sub._old_id != null) {
        reverseMap.set(sub.id, sub._old_id);
      }
    }

    // ── 3. Thêm temp column trên products ──
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "_old_subcategory_id" INT`,
    );

    // ── 4. Map ngược products về numeric ids ──
    for (const [newId, oldId] of reverseMap) {
      await queryRunner.query(
        `UPDATE "products" SET "_old_subcategory_id" = ${oldId} WHERE "subcategory_id" = '${newId}'`,
      );
    }

    // ── 5. Swap products column ──
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "subcategory_id"`);
    await queryRunner.query(
      `ALTER TABLE "products" RENAME COLUMN "_old_subcategory_id" TO "subcategory_id"`,
    );

    // ── 6. Đổi subcategories.id về SERIAL ──
    await queryRunner.query(
      `ALTER TABLE "subcategories" DROP CONSTRAINT "PK_subcategories"`,
    );

    // Map id về old numeric values
    for (const [newId, oldId] of reverseMap) {
      await queryRunner.query(
        `UPDATE "subcategories" SET "id" = '${oldId}' WHERE "id" = '${newId}'`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "subcategories" ALTER COLUMN "id" TYPE INT USING id::int`,
    );
    // Re-create SERIAL sequence (typeorm cần cái này)
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS "subcategories_id_seq"`,
    );
    const maxId = await queryRunner.query(
      `SELECT COALESCE(MAX("id"), 0) + 1 AS "next_id" FROM "subcategories"`,
    );
    await queryRunner.query(
      `ALTER SEQUENCE "subcategories_id_seq" RESTART WITH ${maxId[0].next_id}`,
    );
    await queryRunner.query(
      `ALTER TABLE "subcategories" ALTER COLUMN "id" SET DEFAULT nextval('subcategories_id_seq')`,
    );
    await queryRunner.query(
      `ALTER TABLE "subcategories" ADD CONSTRAINT "PK_subcategories" PRIMARY KEY ("id")`,
    );

    // ── 7. Drop BaseEntity columns ──
    await queryRunner.query(
      `ALTER TABLE "subcategories" DROP COLUMN "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subcategories" DROP COLUMN "updated_at"`,
    );

    // ── 8. Re-add index TRƯỚC FK ──
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "subcategory_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_subcategory_id" ON "products" ("subcategory_id")`,
    );

    // ── 9. Add FK trở lại ──
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_products_subcategory" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE RESTRICT`,
    );

    // ── 10. Cleanup temp column ──
    await queryRunner.query(
      `ALTER TABLE "subcategories" DROP COLUMN "_old_id"`,
    );
  }
}
