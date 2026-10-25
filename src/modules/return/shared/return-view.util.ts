import { throwAppError } from '@common/exceptions/app.exception';
import { EReturnErrorCode } from '@common/exceptions/error-codes';
import { money, moneyOrNull } from '@common/utils/money.util';
import { HttpStatus } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Order } from '../../order/shared/order.entity';
import { OrderItem } from '../../order/shared/order-item.entity';
import { Refund } from '../../refund/refund.entity';
import { ReturnRequest } from './return-request.entity';
import { ReturnRequestItem } from './return-request-item.entity';

/**
 * Khách và admin cùng một shape; admin có thêm người xử lý, đơn và khách. Khoản hoàn gắn với yêu cầu: khoản mới nhất
 * (yêu cầu có thể có nhiều khoản nếu khoản trước bị từ chối rồi nhận lại).
 */
export async function presentReturnViews(manager: EntityManager, requests: ReturnRequest[], admin: boolean) {
  if (!requests.length) return [];
  const ids = requests.map((request) => request.id);
  const items = await manager.find(ReturnRequestItem, { where: { returnRequestId: In(ids) } });
  const orderItems = items.length
    ? await manager.find(OrderItem, { where: { id: In([...new Set(items.map((item) => item.orderItemId))]) } })
    : [];
  const orderItemById = new Map(orderItems.map((orderItem) => [orderItem.id, orderItem]));
  const refunds = await manager.find(Refund, { where: { returnRequestId: In(ids) }, order: { createdAt: 'DESC' } });
  // Đơn cần cho cả khách (tỷ giá chốt trên đơn để suy ra USD) lẫn admin (tóm tắt đơn)
  const orders = await manager.find(Order, { where: { id: In([...new Set(requests.map((request) => request.orderId))]) } });
  const orderById = new Map(orders.map((order) => [order.id, order]));

  return requests.map((request) => {
    const refund = refunds.find((candidate) => candidate.returnRequestId === request.id) ?? null;
    const order = orderById.get(request.orderId);
    // Đơn luôn tồn tại (FK RESTRICT); tỷ giá chốt trên đơn để USD của yêu cầu không đổi khi admin đổi tỷ giá
    const rate = order?.exchangeRate ?? 1;
    const view = {
      id: request.id,
      orderId: request.orderId,
      status: request.status,
      reason: request.reason,
      note: request.note,
      adminNote: request.adminNote,
      createdAt: request.createdAt,
      approvedAt: request.approvedAt,
      receivedAt: request.receivedAt,
      items: items
        .filter((item) => item.returnRequestId === request.id)
        .map((item) => {
          const orderItem = orderItemById.get(item.orderItemId);
          return {
            id: item.id,
            orderItemId: item.orderItemId,
            productName: orderItem?.productName ?? null,
            productImage: orderItem?.productImage ?? null,
            size: orderItem?.size ?? null,
            color: orderItem?.color ?? null,
            ...moneyOrNull('price', orderItem?.price, rate),
            quantity: item.quantity,
            acceptedQuantity: item.acceptedQuantity,
          };
        }),
      refund: refund
        ? {
            ...(admin ? { id: refund.id } : {}),
            ...money('amount', refund.amount, rate),
            status: refund.status,
            bankReference: refund.bankReference,
            processedAt: refund.processedAt,
          }
        : null,
    };
    if (!admin) return view;

    return {
      ...view,
      requestedBy: request.requestedBy,
      processedBy: request.processedBy,
      shippingRefunded: request.shippingRefunded,
      updatedAt: request.updatedAt,
      order: order
        ? {
            id: order.id,
            status: order.status,
            paymentStatus: order.paymentStatus,
            ...money('total', order.total, rate),
            ...money('shippingFee', order.shippingFee, rate),
            exchangeRate: order.exchangeRate,
            deliveredAt: order.deliveredAt,
            userId: order.userId,
            customer: { fullName: order.shippingAddress?.fullName ?? null, phone: order.shippingAddress?.phone ?? null },
          }
        : null,
    };
  });
}

export async function findReturnView(manager: EntityManager, returnId: string, admin: boolean) {
  const request = await manager.findOne(ReturnRequest, { where: { id: returnId } });
  if (!request) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
  return (await presentReturnViews(manager, [request], admin))[0];
}
