import { MigrationInterface, QueryRunner } from 'typeorm';

const PRICE_VND = 2000;

/**
 * Đặt giá của TẤT CẢ sản phẩm về 2.000 VND (giá trị thử nghiệm):
 * - `products.price` = 2000 cho mọi dòng.
 * - `products.original_price` = 2000 cho dòng đang có giá gốc, giữ `NULL` cho dòng không có giá gốc
 *   (thoả `CK_products_original_price`: NULL hoặc `>= price`; không để giá gốc cũ nhỏ hơn giá mới).
 * Không đụng đơn hàng, giỏ hàng, `order_items` đã có (giá snapshot của đơn giữ nguyên).
 *
 * KHÔNG hoàn tác được: giá cũ bị ghi đè và không được lưu lại, nên `down` không khôi phục gì
 * (admin nhập lại giá thật bằng `PATCH /api/admin/products/:id`).
 * Idempotent: chạy lại cho cùng kết quả.
 */
export class SetAllProductPricesTo2000Vnd1792233304878 implements MigrationInterface {
  name = 'SetAllProductPricesTo2000Vnd1792233304878';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "products"
       SET "price" = ${PRICE_VND},
           "original_price" = CASE WHEN "original_price" IS NULL THEN NULL ELSE ${PRICE_VND} END,
           "updated_at" = now()`,
    );
  }

  public async down(): Promise<void> {
    // Giá trước đó không được lưu nên không thể khôi phục.
  }
}
