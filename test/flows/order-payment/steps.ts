import type { User } from '../../../src/modules/user/user.entity';
import { type Builders, bearer, sepayWebhook, type TestApp } from '../../support';

/** Giỏ 1 sản phẩm 350.000đ × quantity + địa chỉ, checkout giao tiêu chuẩn (phí ship 30.000). */
export async function placeOrder(t: TestApp, b: Builders, options: { quantity?: number; customer?: User } = {}) {
  const customer = options.customer ?? (await b.user());
  const product = await b.product();
  await b.cart(customer, [{ product, quantity: options.quantity ?? 2 }]);
  const address = await b.address(customer);

  const res = await t.api.post('/api/orders').set(bearer(t, customer)).send({ addressId: address.id }).expect(201);
  return { customer, product, order: res.body.data as { id: string; status: string; totalVnd: number; paymentStatus: string } };
}

/** Xin mã QR; trả `transferContent` và `amountVnd`. */
export async function createQr(t: TestApp, customer: Parameters<typeof bearer>[1], orderId: string) {
  const res = await t.api.post('/api/payments/qr').set(bearer(t, customer)).send({ orderId }).expect(201);
  return res.body.data as { transferContent: string; amountVnd: number; status: string };
}

/** Webhook tiền vào; `amount` mặc định đúng số QR. */
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

/** Đặt hàng → QR → chuyển đủ tiền. */
export async function placeAndPayOrder(t: TestApp, b: Builders, options: { customer?: User } = {}) {
  const placed = await placeOrder(t, b, options);
  const qr = await createQr(t, placed.customer, placed.order.id);
  await sendTransfer(t, qr).expect(200);
  return { ...placed, qr };
}

/** Đơn đã trả tiền và đã giao (trong hạn đổi trả): 2 × 350.000đ + 30.000đ ship = 730.000đ. */
export async function deliveredPaidOrder(t: TestApp, b: Builders, options: { customer?: User } = {}) {
  const placed = await placeAndPayOrder(t, b, options);
  const admin = await b.admin();
  for (const status of ['shipping', 'delivered']) {
    await t.api.patch(`/api/admin/orders/${placed.order.id}/status`).set(bearer(t, admin)).send({ status }).expect(200);
  }
  const detail = await t.api.get(`/api/orders/${placed.order.id}`).set(bearer(t, placed.customer)).expect(200);
  const items = detail.body.data.items as { id: string; quantity: number }[];
  return { ...placed, admin, items };
}
