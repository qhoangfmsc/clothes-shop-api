import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { createQr, deliveredPaidOrder, placeAndPayOrder, placeOrder, sendTransfer } from '../order-payment/steps';
import { requestReturn } from '../return/steps';

/** Batch 24 (pending-count): số việc chờ xử lý cho badge menu admin, theo quyền, khớp với các danh sách. */
describe('Flow: admin pending counts', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  const counts = (user: User) => t.api.get('/api/admin/pending-counts').set(bearer(t, user));
  const total = async (user: User, path: string) => (await t.api.get(path).set(bearer(t, user)).expect(200)).body.total as number;

  /** Dựng một ít việc ở mỗi nhóm; trả số kỳ vọng. */
  async function seedWork(admin: User) {
    // orders: 1 đơn pending chưa có QR + 1 đơn đã trả (confirmed); đơn có QR còn hạn thì không tính; đơn đã giao không tính
    await placeOrder(t, b);
    const withQr = await placeOrder(t, b);
    await createQr(t, withQr.customer, withQr.order.id);
    await placeAndPayOrder(t, b);
    await deliveredPaidOrder(t, b);
    // refunds: huỷ đơn đã trả → khoản hoàn REQUESTED
    const cancelled = await placeAndPayOrder(t, b);
    await t.api.patch(`/api/admin/orders/${cancelled.order.id}/status`).set(bearer(t, admin)).send({ status: 'cancelled' }).expect(200);
    // returns: 1 yêu cầu REQUESTED, 1 đã duyệt (không tính)
    const returned = await deliveredPaidOrder(t, b);
    await requestReturn(t, returned, { quantity: 1 });
    const approved = await requestReturn(t, returned, { quantity: 1 });
    await t.api.post(`/api/admin/returns/${approved.id}/approve`).set(bearer(t, admin)).send({}).expect(201);
    // payments: 1 giao dịch không khớp phiên nào
    await sendTransfer(t, { transferContent: 'NOCODEATALL', amountVnd: 123_000 }).expect(200);
    // reviews: 2 đánh giá hiển thị chưa phản hồi, 1 đã phản hồi, 1 đã ẩn
    const product = await b.product();
    await b.review(product);
    await b.review(product);
    await b.review(product, { reply: 'Cảm ơn', repliedAt: new Date(), repliedBy: admin.id });
    await b.review(product, { status: 'HIDDEN', moderationNote: 'Spam' });
  }

  it('is all zero for a shop with nothing waiting, with every key present for an admin', async () => {
    const admin = await b.admin();

    const res = await counts(admin).expect(200);

    expect(res.body).toEqual({ data: { orders: 0, payments: 0, refunds: 0, returns: 0, reviews: 0 } });
  });

  it('counts the work waiting in each area for an admin, and every number equals the total of the list it links to', async () => {
    const admin = await b.admin();
    await seedWork(admin);

    const res = await counts(admin).expect(200);

    expect(res.body.data).toEqual({ orders: 2, payments: 1, refunds: 1, returns: 1, reviews: 2 });
    expect(await total(admin, '/api/admin/orders?needsAction=true')).toBe(res.body.data.orders);
    expect(await total(admin, '/api/admin/payments/transactions?needsReview=true')).toBe(res.body.data.payments);
    expect(await total(admin, '/api/admin/refunds?status=REQUESTED')).toBe(res.body.data.refunds);
    expect(await total(admin, '/api/admin/returns?status=REQUESTED')).toBe(res.body.data.returns);
    expect(await total(admin, '/api/admin/reviews?status=PUBLISHED&replied=false')).toBe(res.body.data.reviews);
  });

  it('goes down as the work is done: reply to a review, approve a return, complete a refund', async () => {
    const admin = await b.admin();
    await seedWork(admin);
    const [review] = (await t.api.get('/api/admin/reviews?status=PUBLISHED&replied=false').set(bearer(t, admin)).expect(200)).body.data;
    await t.api.put(`/api/admin/reviews/${review.id}/reply`).set(bearer(t, admin)).send({ content: 'Cảm ơn' }).expect(200);
    const [pendingReturn] = (await t.api.get('/api/admin/returns?status=REQUESTED').set(bearer(t, admin)).expect(200)).body.data;
    await t.api.post(`/api/admin/returns/${pendingReturn.id}/reject`).set(bearer(t, admin)).send({ note: 'Quá hạn' }).expect(201);
    const [refund] = (await t.api.get('/api/admin/refunds?status=REQUESTED').set(bearer(t, admin)).expect(200)).body.data;
    await t.api
      .post(`/api/admin/refunds/${refund.id}/complete`)
      .set(bearer(t, admin))
      .send({ reference: 'FT-PENDING-1', note: 'Đã chuyển' })
      .expect(201);

    const res = await counts(admin).expect(200);

    expect(res.body.data).toMatchObject({ reviews: 1, returns: 0, refunds: 0 });
  });

  it('returns only the keys a non-admin may see', async () => {
    const admin = await b.admin();
    await seedWork(admin);
    const reviewer = await b.user({ permissions: [18000] });
    const orderClerk = await b.user({ permissions: [9000] });
    const cashier = await b.user({ permissions: [14000] });
    const returns = await b.user({ permissions: [16000] });

    expect((await counts(reviewer).expect(200)).body).toEqual({ data: { reviews: 2 } });
    expect((await counts(orderClerk).expect(200)).body).toEqual({ data: { orders: 2 } });
    expect((await counts(cashier).expect(200)).body).toEqual({ data: { payments: 1, refunds: 1 } });
    expect((await counts(returns).expect(200)).body).toEqual({ data: { returns: 1 } });
  });

  it('answers 0 (not a missing key) for a permitted area with nothing waiting', async () => {
    const reviewer = await b.user({ permissions: [18000] });

    const res = await counts(reviewer).expect(200);

    expect(res.body).toEqual({ data: { reviews: 0 } });
  });

  it('answers 403 / 9001 for a customer without any of the four view permissions', async () => {
    const customer = await b.user();

    const res = await counts(customer);

    expect([res.status, res.body.errorCode]).toEqual([403, 9001]);
  });
});
