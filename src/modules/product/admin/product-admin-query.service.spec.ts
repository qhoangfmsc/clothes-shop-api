import { MoreThanOrEqual } from 'typeorm';
import { setup } from './admin.test-utils';

describe('ProductAdminQueryService rating filter and sort', () => {
  it('admin list: minRating and rating sorts', async () => {
    const { service, productRepo } = setup();
    await service.findAllAdmin({ minRating: 3, sort: '-ratingAverage' });
    const opts = productRepo.findAndCount.mock.calls[0][0];
    expect(opts.where).toEqual({ ratingAverage: MoreThanOrEqual(3) });
    expect(opts.order).toEqual({ ratingAverage: { direction: 'DESC', nulls: 'LAST' }, id: 'ASC' });
  });

  it('admin list: minRating combines with search into every OR branch', async () => {
    const { service, productRepo } = setup();
    await service.findAllAdmin({ minRating: 5, search: 'shirt' });
    const where = productRepo.findAndCount.mock.calls[0][0].where as any[];
    expect(where).toHaveLength(4);
    for (const branch of where) expect(branch.ratingAverage).toEqual(MoreThanOrEqual(5));
  });
});
