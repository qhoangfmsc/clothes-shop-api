import { type Builders, bearer, sepayWebhook, type TestApp } from '../../support';

/** Các bước dùng lại của luồng đặt hàng – thanh toán. Mỗi bước đi qua HTTP thật và kiểm status code ngay tại chỗ. */

/** Khách có giỏ (1 sản phẩm 350.000đ × quantity) + địa chỉ, rồi checkout giao tiêu chuẩn: tổng = 350.000 × quantity + 30.000 phí ship */
export async function placeOrder(t: TestApp, b: Builders, options: { quantity?: number } = {}) {
  const customer = await b.user();
  const product = await b.product();
  await b.cart(customer, [{ product, quantity: options.quantity ?? 2 }]);
  const address = await b.address(customer);

  const res = await t.api.post('/api/orders').set(bearer(t, customer)).send({ addressId: address.id }).expect(201);
  return { customer, product, order: res.body.data as { id: string; status: string; totalVnd: number; paymentStatus: string } };
}

/** Khách xin mã QR cho đơn; trả `transferContent` (mã `DH...`) và `amountVnd` phải chuyển */
export async function createQr(t: TestApp, customer: Parameters<typeof bearer>[1], orderId: string) {
  const res = await t.api.post('/api/payments/qr').set(bearer(t, customer)).send({ orderId }).expect(201);
  return res.body.data as { transferContent: string; amountVnd: number; status: string };
}

/** Ngân hàng báo tiền vào qua webhook SePay (ký đúng chuẩn). `amount` mặc định đúng số QR yêu cầu */
export function sendTransfer(
  t: TestApp,
  qr: { transferContent: string; amountVnd: number },
  options: { id?: string; amount?: number } = {},
) {
  const hook = sepayWebhook({
    id: options.id ?? `sepay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    amount: options.amount ?? qr.amountVnd,
    content: `MBVCB chuyen khoan ${qr.transferContent}`,
  });
  return t.api.post('/api/webhooks/sepay').set(hook.headers).send(hook.body);
}

/** Đặt hàng → xin QR → chuyển đủ tiền: trả đơn đã `paid` + `confirmed` */
export async function placeAndPayOrder(t: TestApp, b: Builders) {
  const placed = await placeOrder(t, b);
  const qr = await createQr(t, placed.customer, placed.order.id);
  await sendTransfer(t, qr).expect(200);
  return { ...placed, qr };
}
