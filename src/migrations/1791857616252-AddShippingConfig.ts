import { customAlphabet } from 'nanoid';
import { MigrationInterface, QueryRunner } from 'typeorm';

const nanoid16 = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16);

/**
 * Phí ship / ngưỡng miễn phí ship chuyển từ hằng số trong code sang `site_configs`
 * (key `SHIPPING_CONFIG`, type `SHIPPING`) để admin chỉnh được:
 * - mở rộng CHECK `CK_site_configs_type` thêm `SHIPPING`
 * - seed dòng `SHIPPING_CONFIG` với đúng giá trị đang chạy (standard 8, express 15, store-pickup 0, miễn phí từ 150)
 *
 * Idempotent: chạy lại không lỗi, không ghi đè dòng admin đã sửa.
 * Giá trị seed phải hợp lệ với `parseShippingConfig` (src/modules/shipping/shipping-config.ts); nếu dòng bị hỏng/thiếu,
 * code tự dùng `DEFAULT_SHIPPING_CONFIG` nên checkout không bị chặn.
 */
export class AddShippingConfig1791857616252 implements MigrationInterface {
  name = 'AddShippingConfig1791857616252';

  private readonly seed = {
    freeShippingThreshold: 150,
    methods: [
      { id: 'standard', name: 'Standard Shipping', description: 'Delivered in eco-friendly packaging', estimatedDays: '5-7 business days', price: 8, icon: 'truck' },
      { id: 'express', name: 'Express Shipping', description: 'Priority handling and faster delivery', estimatedDays: '2-3 business days', price: 15, icon: 'express' },
      { id: 'store-pickup', name: 'Store Pickup', description: 'Pick up at our flagship store', estimatedDays: '1-2 business days', price: 0, icon: 'store' },
    ],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "site_configs" DROP CONSTRAINT IF EXISTS "CK_site_configs_type"`);
    await queryRunner.query(`ALTER TABLE "site_configs" ADD CONSTRAINT "CK_site_configs_type" CHECK ("type" IN ('BANNER', 'TEXT', 'SHIPPING'))`);
    await queryRunner.query(
      `INSERT INTO "site_configs" ("id", "key", "type", "value") VALUES ($1, 'SHIPPING_CONFIG', 'SHIPPING', $2) ON CONFLICT ("key") DO NOTHING`,
      [nanoid16(), JSON.stringify(this.seed)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "site_configs" WHERE "type" = 'SHIPPING'`);
    await queryRunner.query(`ALTER TABLE "site_configs" DROP CONSTRAINT IF EXISTS "CK_site_configs_type"`);
    await queryRunner.query(`ALTER TABLE "site_configs" ADD CONSTRAINT "CK_site_configs_type" CHECK ("type" IN ('BANNER', 'TEXT'))`);
  }
}
