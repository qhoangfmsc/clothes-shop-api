import type { EntityManager } from 'typeorm';
import { findLocked } from './lock.util';

class Thing {
  id: string;
}

describe('findLocked', () => {
  const setup = (found: unknown) => {
    const findOne = jest.fn(async () => found);
    return { manager: { findOne } as unknown as EntityManager, findOne };
  };

  it('asks for a pessimistic write lock on the given where', async () => {
    const { manager, findOne } = setup({ id: 't1' });
    await expect(findLocked(manager, Thing, { id: 't1' })).resolves.toEqual({ id: 't1' });
    expect(findOne).toHaveBeenCalledWith(Thing, { where: { id: 't1' }, lock: { mode: 'pessimistic_write' } });
  });

  it('passes select and order through and returns null when nothing matches', async () => {
    const { manager, findOne } = setup(null);
    await expect(findLocked(manager, Thing, { id: 't1' }, { select: { id: true }, order: { id: 'DESC' } })).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith(Thing, {
      select: { id: true },
      order: { id: 'DESC' },
      where: { id: 't1' },
      lock: { mode: 'pessimistic_write' },
    });
  });
});
