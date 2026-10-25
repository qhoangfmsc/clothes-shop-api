import { assertOrderPayable } from './payment-payable.util';

describe('assertOrderPayable', () => {
  it('accepts an unpaid, non-cancelled order', () => {
    expect(() => assertOrderPayable({ paymentStatus: 'unpaid', status: 'pending' })).not.toThrow();
  });

  it.each(['paid', 'refunded'] as const)('rejects a %s order with 1702', (paymentStatus) => {
    expect(() => assertOrderPayable({ paymentStatus, status: 'pending' })).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ errorCode: 1702 }) }),
    );
  });

  it('rejects a cancelled order with 1702', () => {
    expect(() => assertOrderPayable({ paymentStatus: 'unpaid', status: 'cancelled' })).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ errorCode: 1702 }) }),
    );
  });
});
