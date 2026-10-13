/**
 * `orders.total` (đơn vị cửa hàng, decimal trả về từ DB dạng chuỗi) → số tiền VND nguyên theo tỷ giá `PAYMENT_VND_PER_UNIT`.
 * Nơi DUY NHẤT quy đổi: báo giá (`POST /api/orders/quote`) và phiên thanh toán QR dùng chung nên hai con số luôn bằng nhau.
 */
export function convertToVnd(total: number | string, vndPerUnit: number): number {
  return Math.round(Number(total) * vndPerUnit);
}
