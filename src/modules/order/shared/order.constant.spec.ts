import { ORDER_STATUSES, type OrderStatus } from '@common/constants/enum-values.constant';
import { ORDER_TRANSITIONS } from './order.constant';

const TERMINAL: OrderStatus[] = ['completed', 'cancelled'];

describe('ORDER_TRANSITIONS', () => {
  it('matches the documented flow exactly', () => {
    expect(ORDER_TRANSITIONS).toEqual({
      pending: ['confirmed', 'cancelled'],
      confirmed: ['shipping', 'cancelled'],
      shipping: ['delivered'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    });
  });

  it('declares every status, and only known ones as targets', () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());
    for (const targets of Object.values(ORDER_TRANSITIONS)) for (const target of targets) expect(ORDER_STATUSES).toContain(target);
  });

  it('has terminal states with no way out, and no state moving to itself', () => {
    for (const status of TERMINAL) expect(ORDER_TRANSITIONS[status]).toEqual([]);
    for (const status of ORDER_STATUSES) expect(ORDER_TRANSITIONS[status]).not.toContain(status);
  });

  it('lets every non-terminal state reach a terminal state, and never goes back to pending', () => {
    const reachesTerminal = (from: OrderStatus, seen = new Set<OrderStatus>()): boolean => {
      if (TERMINAL.includes(from)) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return ORDER_TRANSITIONS[from].some((next) => reachesTerminal(next, seen));
    };
    for (const status of ORDER_STATUSES) expect([status, reachesTerminal(status)]).toEqual([status, true]);
    for (const targets of Object.values(ORDER_TRANSITIONS)) expect(targets).not.toContain('pending');
  });

  it('only allows cancelling before the goods ship', () => {
    const cancellableFrom = ORDER_STATUSES.filter((status) => ORDER_TRANSITIONS[status].includes('cancelled'));
    expect(cancellableFrom).toEqual(['pending', 'confirmed']);
  });
});
