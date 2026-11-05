import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

const UNKNOWN_ID = 'zzzzzzzzzzzzzzzz';

describe('Flow: address error codes', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  it("answers 404 / 2101 for an unknown address and for another user's address, leaving it untouched", async () => {
    const [user, owner] = [await b.user(), await b.user()];
    const foreign = await b.address(owner, { label: 'Home' });

    for (const id of [UNKNOWN_ID, foreign.id]) {
      const update = await t.api.patch(`/api/addresses/${id}`).set(bearer(t, user)).send({ label: 'Hacked' });
      const remove = await t.api.delete(`/api/addresses/${id}`).set(bearer(t, user));
      for (const res of [update, remove]) {
        expect({ status: res.status, errorCode: res.body.errorCode, message: res.body.message }).toEqual({
          status: 404,
          errorCode: 2101,
          message: 'Address not found',
        });
      }
    }
    expect(await t.dataSource.query('SELECT label FROM addresses')).toEqual([{ label: 'Home' }]);
  });
});
