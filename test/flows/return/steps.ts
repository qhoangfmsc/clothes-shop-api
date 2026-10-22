import { type Builders, bearer, type TestApp } from '../../support';
import { placeAndPayOrder } from '../order-payment/steps';

/** Đơn đã trả tiền và đã giao (trong hạn đổi trả): 2 × 350.000đ + 30.000đ ship = 730.000đ. */
export async function deliveredPaidOrder(t: TestApp, b: Builders) {
  const placed = await placeAndPayOrder(t, b);
  const admin = await b.admin();
  for (const status of ['shipping', 'delivered']) {
    await t.api.patch(`/api/admin/orders/${placed.order.id}/status`).set(bearer(t, admin)).send({ status }).expect(200);
  }
  const detail = await t.api.get(`/api/orders/${placed.order.id}`).set(bearer(t, placed.customer)).expect(200);
  const items = detail.body.data.items as { id: string; quantity: number }[];
  return { ...placed, admin, items };
}

/** Khách xin trả `quantity` cái của dòng đầu tiên; trả về view của yêu cầu. */
export async function requestReturn(
  t: TestApp,
  entry: Awaited<ReturnType<typeof deliveredPaidOrder>>,
  options: { quantity?: number; reason?: string; note?: string } = {},
) {
  const res = await t.api
    .post('/api/returns')
    .set(bearer(t, entry.customer))
    .send({
      orderId: entry.order.id,
      reason: options.reason ?? 'WRONG_SIZE',
      note: options.note,
      items: [{ orderItemId: entry.items[0].id, quantity: options.quantity ?? 1 }],
    })
    .expect(201);
  return res.body.data as { id: string; status: string; items: { id: string; orderItemId: string; quantity: number }[] };
}
