import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWishlistCartOrderAddress1783485479708 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Addresses ──
    await queryRunner.query(`
      CREATE TABLE "addresses" (
        "id"             VARCHAR(16)  NOT NULL,
        "user_id"        VARCHAR(16)  NOT NULL,
        "label"          VARCHAR(100) NOT NULL DEFAULT '',
        "full_name"      VARCHAR(255) NOT NULL,
        "phone"          VARCHAR(50)  NOT NULL,
        "address_line_1" VARCHAR(500) NOT NULL,
        "address_line_2" VARCHAR(500) NOT NULL DEFAULT '',
        "city"           VARCHAR(255) NOT NULL,
        "province"       VARCHAR(255) NOT NULL DEFAULT '',
        "postal_code"    VARCHAR(20)  NOT NULL DEFAULT '',
        "country"        VARCHAR(100) NOT NULL DEFAULT 'Vietnam',
        "is_default"     BOOLEAN      NOT NULL DEFAULT false,
        "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_addresses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_addresses_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_addresses_user_id" ON "addresses" ("user_id")`);

    // ── Wishlists ──
    await queryRunner.query(`
      CREATE TABLE "wishlists" (
        "id"         VARCHAR(16)  NOT NULL,
        "user_id"    VARCHAR(16)  NOT NULL,
        "product_id" VARCHAR(16)  NOT NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wishlists" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wishlists_user_product" UNIQUE ("user_id", "product_id"),
        CONSTRAINT "FK_wishlists_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wishlists_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_wishlists_user_id" ON "wishlists" ("user_id")`);

    // ── Carts ──
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id"         VARCHAR(16)  NOT NULL,
        "user_id"    VARCHAR(16)  NOT NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_carts_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_carts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ── Cart Items ──
    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id"         VARCHAR(16)  NOT NULL,
        "cart_id"    VARCHAR(16)  NOT NULL,
        "product_id" VARCHAR(16)  NOT NULL,
        "quantity"   INT          NOT NULL DEFAULT 1 CHECK ("quantity" >= 1),
        "size"       VARCHAR(50)  NOT NULL DEFAULT '',
        "color"      VARCHAR(100) NOT NULL DEFAULT '',
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cart_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cart_items_cart" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cart_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cart_items_cart_id" ON "cart_items" ("cart_id")`);

    // ── Orders ──
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"               VARCHAR(16)   NOT NULL,
        "user_id"          VARCHAR(16)   NOT NULL,
        "status"           VARCHAR(20)   NOT NULL DEFAULT 'pending',
        "subtotal"         DECIMAL(10,2) NOT NULL DEFAULT 0,
        "shipping_fee"     DECIMAL(10,2) NOT NULL DEFAULT 0,
        "total"            DECIMAL(10,2) NOT NULL DEFAULT 0,
        "shipping_method"  VARCHAR(100)  NOT NULL DEFAULT '',
        "shipping_address" JSONB         NOT NULL DEFAULT '{}',
        "note"             VARCHAR(500)  NOT NULL DEFAULT '',
        "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_orders_user_id" ON "orders" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_status" ON "orders" ("status")`);

    // ── Order Items ──
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id"            VARCHAR(16)   NOT NULL,
        "order_id"      VARCHAR(16)   NOT NULL,
        "product_id"    VARCHAR(16),
        "product_name"  VARCHAR(255)  NOT NULL,
        "product_image" VARCHAR(500)  NOT NULL DEFAULT '',
        "price"         DECIMAL(10,2) NOT NULL,
        "quantity"      INT           NOT NULL DEFAULT 1,
        "size"          VARCHAR(50)   NOT NULL DEFAULT '',
        "color"         VARCHAR(100)  NOT NULL DEFAULT '',
        "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_order_items_order_id" ON "order_items" ("order_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cart_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "carts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wishlists"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "addresses"`);
  }
}
