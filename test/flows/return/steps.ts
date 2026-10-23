import { bearer, type TestApp } from '../../support';
import type { deliveredPaidOrder } from '../order-payment/steps';

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
