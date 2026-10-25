import { markReturnRefunded, reopenReturnAfterRefundRejected } from './return-refund-state.util';
import { ReturnRequest } from './return-request.entity';
import { ReturnRequestItem } from './return-request-item.entity';

const fakeManager = () => ({ update: jest.fn(async () => ({ affected: 1 })) });

describe('return refund state', () => {
  it('moves only a RECEIVED request to REFUNDED', async () => {
    const manager = fakeManager();

    await markReturnRefunded(manager as never, 'ret1');

    expect(manager.update.mock.calls).toEqual([[ReturnRequest, { id: 'ret1', status: 'RECEIVED' }, { status: 'REFUNDED' }]]);
  });

  it('reopens only a RECEIVED request to APPROVED and clears what was decided at receiving', async () => {
    const manager = fakeManager();

    await reopenReturnAfterRefundRejected(manager as never, 'ret1');

    expect(manager.update.mock.calls).toEqual([
      [ReturnRequest, { id: 'ret1', status: 'RECEIVED' }, { status: 'APPROVED', receivedAt: null, shippingRefunded: false }],
      [ReturnRequestItem, { returnRequestId: 'ret1' }, { acceptedQuantity: null }],
    ]);
  });
});
