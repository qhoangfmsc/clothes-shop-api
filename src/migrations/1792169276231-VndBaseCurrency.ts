import { customAlphabet } from 'nanoid';
import { MigrationInterface, QueryRunner } from 'typeorm';

const nanoid16 = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16);

const SEED_VND_PER_USD = 25000;

/**
 * Tiền tệ gốc chuyển từ "đơn vị cửa hàng" (USD, decimal(10,2)) sang VND (bigint, số nguyên); USD chỉ còn là giá trị suy ra khi trả API:
 * - `products.price/original_price`, `order_items.price`, `orders.subtotal/shipping_fee/total`: decimal(10,2) → bigint.
 *   KHÔNG nhân giá trị với tỷ giá: giá sản phẩm và phí ship do admin nhập lại bằng VND; giá trị cũ chỉ được làm tròn về số nguyên
 *   (giá tối thiểu 1 để giữ CHECK `price > 0`).
 * - `orders.exchange_rate` numeric(12,2) NOT NULL CHECK > 0: tỷ giá chốt lúc đặt (VND/USD), để USD của đơn không đổi khi admin đổi tỷ giá.
 *   Đơn cũ được điền tỷ giá seed.
 * - `site_configs`: mở rộng CHECK `CK_site_configs_type` thêm `CURRENCY`, seed dòng `EXCHANGE_RATE` (`{"vndPerUsd": ...}`), và đổi tên khoá
 *   trong `SHIPPING_CONFIG` (`price` → `priceVnd`, `freeShippingThreshold` → `freeShippingThresholdVnd`, giá trị làm tròn về số nguyên).
 *
 * Tỷ giá seed là 25000 (`SEED_VND_PER_USD`); admin đổi sau đó qua site-config `EXCHANGE_RATE`. Migration không đọc biến môi trường nào.
 * Idempotent: chạy lại không lỗi, không ghi đè `EXCHANGE_RATE` admin đã sửa.
 *
 * `down` đưa kiểu cột về decimal(10,2) (giá trị VND quá 99.999.999 sẽ làm `down` lỗi), không quy đổi lại giá trị.
 */
export class VndBaseCurrency1792169276231 implements MigrationInterface {
  name = 'VndBaseCurrency1792169276231';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rate = SEED_VND_PER_USD;

    // --- products
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "price" TYPE bigint USING GREATEST(1, round("price"))::bigint`);
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "original_price" TYPE bigint USING (CASE WHEN "original_price" IS NULL THEN NULL ELSE GREATEST(1, round("original_price"))::bigint END)`,
    );

    // --- orders / order_items
    await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "price" TYPE bigint USING GREATEST(1, round("price"))::bigint`);
    for (const column of ['subtotal', 'shipping_fee', 'total']) {
      await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "${column}" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "${column}" TYPE bigint USING round("${column}")::bigint`);
      await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "${column}" SET DEFAULT 0`);
    }

    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(12,2) NOT NULL DEFAULT ${rate}`);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "exchange_rate" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_exchange_rate"`);
    await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CK_orders_exchange_rate" CHECK ("exchange_rate" > 0)`);

    // --- site_configs
    await queryRunner.query(`ALTER TABLE "site_configs" DROP CONSTRAINT IF EXISTS "CK_site_configs_type"`);
    await queryRunner.query(
      `ALTER TABLE "site_configs" ADD CONSTRAINT "CK_site_configs_type" CHECK ("type" IN ('BANNER', 'TEXT', 'SHIPPING', 'CURRENCY'))`,
    );
    await queryRunner.query(
      `INSERT INTO "site_configs" ("id", "key", "type", "value") VALUES ($1, 'EXCHANGE_RATE', 'CURRENCY', $2) ON CONFLICT ("key") DO NOTHING`,
      [nanoid16(), JSON.stringify({ vndPerUsd: rate })],
    );
    await this.rewriteShippingConfig(queryRunner, (config) => {
      const { freeShippingThreshold, methods, ...rest } = config;
      return {
        ...rest,
        freeShippingThresholdVnd:
          freeShippingThreshold === null || freeShippingThreshold === undefined ? null : Math.max(1, Math.round(freeShippingThreshold)),
        methods: (methods ?? []).map(({ price, ...method }: { price: number }) => ({ ...method, priceVnd: Math.max(0, Math.round(price)) })),
      };
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rewriteShippingConfig(queryRunner, (config) => {
      const { freeShippingThresholdVnd, methods, ...rest } = config;
      return {
        ...rest,
        freeShippingThreshold: freeShippingThresholdVnd ?? null,
        methods: (methods ?? []).map(({ priceVnd, ...method }: { priceVnd: number }) => ({ ...method, price: priceVnd })),
      };
    });
    await queryRunner.query(`DELETE FROM "site_configs" WHERE "type" = 'CURRENCY'`);
    await queryRunner.query(`ALTER TABLE "site_configs" DROP CONSTRAINT IF EXISTS "CK_site_configs_type"`);
    await queryRunner.query(`ALTER TABLE "site_configs" ADD CONSTRAINT "CK_site_configs_type" CHECK ("type" IN ('BANNER', 'TEXT', 'SHIPPING'))`);

    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CK_orders_exchange_rate"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "exchange_rate"`);
    for (const column of ['subtotal', 'shipping_fee', 'total']) {
      await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "${column}" DROP DEFAULT`);
      await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "${column}" TYPE DECIMAL(10,2) USING "${column}"::numeric(10,2)`);
      await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "${column}" SET DEFAULT 0`);
    }
    await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "price" TYPE DECIMAL(10,2) USING "price"::numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "original_price" TYPE DECIMAL(10,2) USING "original_price"::numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "price" TYPE DECIMAL(10,2) USING "price"::numeric(10,2)`);
  }

  /** Đọc dòng `SHIPPING_CONFIG`, biến đổi JSON và ghi lại; dòng thiếu hoặc không phải JSON object thì bỏ qua */
  private async rewriteShippingConfig(queryRunner: QueryRunner, transform: (config: any) => unknown): Promise<void> {
    const rows: { value: string }[] = await queryRunner.query(`SELECT "value" FROM "site_configs" WHERE "key" = 'SHIPPING_CONFIG'`);
    if (!rows.length) return;
    let config: unknown;
    try {
      config = JSON.parse(rows[0].value);
    } catch {
      return;
    }
    if (typeof config !== 'object' || config === null || Array.isArray(config)) return;
    await queryRunner.query(`UPDATE "site_configs" SET "value" = $1 WHERE "key" = 'SHIPPING_CONFIG'`, [JSON.stringify(transform(config))]);
  }
}
