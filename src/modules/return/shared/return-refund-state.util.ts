import { EntityManager } from 'typeorm';
import { ReturnRequest } from './return-request.entity';
import { ReturnRequestItem } from './return-request-item.entity';

/** Chuyển trạng thái yêu cầu trả hàng khi khoản hoàn của nó có kết quả; module return sở hữu vòng đời, payment gọi trong transaction đã khoá đơn */

/** Khoản hoàn xong: yêu cầu `RECEIVED` → `REFUNDED` (không đổi nếu yêu cầu không còn `RECEIVED`) */
export async function markReturnRefunded(manager: EntityManager, returnRequestId: string): Promise<void> {
  await manager.update(ReturnRequest, { id: returnRequestId, status: 'RECEIVED' }, { status: 'REFUNDED' });
}

/** Khoản hoàn bị từ chối: yêu cầu về `APPROVED` để cửa hàng nhận/chốt lại số lượng và tạo lại khoản hoàn */
export async function reopenReturnAfterRefundRejected(manager: EntityManager, returnRequestId: string): Promise<void> {
  await manager.update(
    ReturnRequest,
    { id: returnRequestId, status: 'RECEIVED' },
    { status: 'APPROVED', receivedAt: null, shippingRefunded: false },
  );
  await manager.update(ReturnRequestItem, { returnRequestId }, { acceptedQuantity: null });
}
