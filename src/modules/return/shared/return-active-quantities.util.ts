import { EntityManager, In } from 'typeorm';
import { ACTIVE_RETURN_STATUSES } from './return.constant';
import { ReturnRequest } from './return-request.entity';
import { ReturnRequestItem } from './return-request-item.entity';

/** Số lượng từng dòng đơn đã nằm trong các yêu cầu còn hiệu lực */
export async function activeReturnQuantities(manager: EntityManager, orderId: string): Promise<Map<string, number>> {
  const requests = await manager.find(ReturnRequest, { where: { orderId, status: In([...ACTIVE_RETURN_STATUSES]) } });
  const items = requests.length
    ? await manager.find(ReturnRequestItem, { where: { returnRequestId: In(requests.map((request) => request.id)) } })
    : [];
  const quantities = new Map<string, number>();
  for (const item of items) quantities.set(item.orderItemId, (quantities.get(item.orderItemId) ?? 0) + item.quantity);
  return quantities;
}
