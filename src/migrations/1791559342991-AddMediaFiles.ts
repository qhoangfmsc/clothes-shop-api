import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `media_files` — metadata for images uploaded to Supabase Storage so the
 * admin media list can be paginated/searched/sorted in SQL instead of listing
 * the whole bucket on every request. The file bytes stay in the bucket;
 * `storage_key` is the object key there (public URL is derived from it).
 *
 * Hand-written (not `migration:generate`) — live DB has schema drift, see
 * AddSiteConfig migration.
 */
export class AddMediaFiles1791559342991 implements MigrationInterface {
  name = 'AddMediaFiles1791559342991';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "media_files" (
        "id" character varying(16) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying(255) NOT NULL,
        "storage_key" character varying(255) NOT NULL,
        "mime_type" character varying(100) NOT NULL,
        "size" integer NOT NULL,
        CONSTRAINT "PK_media_files" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_media_files_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "CK_media_files_size" CHECK ("size" >= 0),
        CONSTRAINT "CK_media_files_mime_type" CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'))
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_media_files_created_at" ON "media_files" ("created_at" DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_media_files_created_at"`);
    await queryRunner.query(`DROP TABLE "media_files"`);
  }
}
