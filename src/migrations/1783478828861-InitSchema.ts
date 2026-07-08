import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1783478828861 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Users ──
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"          VARCHAR(16)  NOT NULL,
        "email"       VARCHAR(255) NOT NULL,
        "password"    VARCHAR(255),
        "name"        VARCHAR(255),
        "image"       VARCHAR(500),
        "provider"    VARCHAR(50),
        "provider_id" VARCHAR(255),
        "status"      VARCHAR(20)  NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // ── Products ──
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"              VARCHAR(16)      NOT NULL,
        "slug"            VARCHAR(255)     NOT NULL,
        "sku"             VARCHAR(255)     NOT NULL,
        "name"            VARCHAR(255)     NOT NULL,
        "price"           DECIMAL(10,2)    NOT NULL,
        "original_price"  DECIMAL(10,2),
        "images"          JSONB            NOT NULL DEFAULT '[]',
        "category"        VARCHAR(100)     NOT NULL,
        "subcategory"     VARCHAR(100)     NOT NULL,
        "badge"           VARCHAR(50),
        "status"          VARCHAR(20)      NOT NULL DEFAULT 'active',
        "description"     TEXT             NOT NULL DEFAULT '',
        "material"        VARCHAR(255)     NOT NULL DEFAULT '',
        "care"            VARCHAR(500)     NOT NULL DEFAULT '',
        "sizes"           JSONB            NOT NULL DEFAULT '[]',
        "colors"          JSONB            NOT NULL DEFAULT '[]',
        "tags"            JSONB            NOT NULL DEFAULT '[]',
        "created_at"      TIMESTAMPTZ      NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ      NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_products_slug" UNIQUE ("slug"),
        CONSTRAINT "UQ_products_sku"  UNIQUE ("sku")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_products_category" ON "products" ("category")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_subcategory" ON "products" ("subcategory")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_badge" ON "products" ("badge")`);
    await queryRunner.query(`CREATE INDEX "IDX_products_status" ON "products" ("status")`);

    // ── Categories ──
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id"          VARCHAR(16)  NOT NULL,
        "slug"        VARCHAR(255) NOT NULL,
        "title"       VARCHAR(255) NOT NULL,
        "description" TEXT         NOT NULL DEFAULT '',
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_categories"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_categories_slug" UNIQUE ("slug")
      )
    `);

    // ── Subcategories ──
    await queryRunner.query(`
      CREATE TABLE "subcategories" (
        "id"          SERIAL       NOT NULL,
        "slug"        VARCHAR(255) NOT NULL,
        "label"       VARCHAR(255) NOT NULL,
        "description" TEXT         NOT NULL DEFAULT '',
        "count"       INT          NOT NULL DEFAULT 0,
        "category_id" VARCHAR(16)  NOT NULL,
        CONSTRAINT "PK_subcategories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subcategories_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);

    // ── Collections ──
    await queryRunner.query(`
      CREATE TABLE "collections" (
        "id"          VARCHAR(16)  NOT NULL,
        "slug"        VARCHAR(255) NOT NULL,
        "name"        VARCHAR(255) NOT NULL,
        "subtitle"    VARCHAR(500) NOT NULL DEFAULT '',
        "description" TEXT         NOT NULL DEFAULT '',
        "image"       VARCHAR(500) NOT NULL,
        "product_ids" JSONB        NOT NULL DEFAULT '[]',
        "season"      VARCHAR(100) NOT NULL DEFAULT '',
        "bg_color"    VARCHAR(100) NOT NULL DEFAULT '',
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_collections"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_collections_slug" UNIQUE ("slug")
      )
    `);

    // ── Reviews ──
    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id"         VARCHAR(16)  NOT NULL,
        "product_id" VARCHAR(16)  NOT NULL,
        "user_id"    VARCHAR(16),
        "author"     VARCHAR(255) NOT NULL,
        "avatar"     VARCHAR(500) NOT NULL DEFAULT '',
        "rating"     INT          NOT NULL CHECK ("rating" >= 1 AND "rating" <= 5),
        "date"       VARCHAR(50)  NOT NULL,
        "title"      VARCHAR(500) NOT NULL DEFAULT '',
        "content"    TEXT         NOT NULL DEFAULT '',
        "verified"   BOOLEAN      NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reviews_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_reviews_product_id" ON "reviews" ("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_reviews_user_id" ON "reviews" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reviews"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "collections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subcategories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
