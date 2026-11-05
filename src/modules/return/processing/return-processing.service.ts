import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EReturnErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Order } from '../../order/shared/order.entity';
import { OrderItem } from '../../order/shared/order-item.entity';
import { RefundService } from '../../refund/refund.service';
import { REJECTABLE_RETURN_STATUSES } from '../shared/return.constant';
import { ReturnRequest } from '../shared/return-request.entity';
import { ReturnRequestItem } from '../shared/return-request-item.entity';
import { assertReturnStatus } from '../shared/return-status.util';
import { ApproveReturnDto } from './dtos/approve-return.dto';
import { ReceiveReturnDto } from './dtos/receive-return.dto';
import { RejectReturnDto } from './dtos/reject-return.dto';
import { ReturnProcessingQueryService } from './return-processing-query.service';

/**
 * Trả hàng sau khi giao. Luồng: khách gửi yêu cầu (REQUESTED) → cửa hàng duyệt (APPROVED) → khách gửi hàng về → cửa hàng nhận và
 * kiểm hàng (RECEIVED, tạo yêu cầu hoàn tiền ở module payment) → admin chuyển khoản hoàn (REFUNDED, do module payment cập nhật).
 * "Đổi" không có luồng riêng: trả hàng được hoàn tiền rồi khách đặt đơn mới.
 *
 * Mọi thao tác ghi khoá theo thứ tự `orders` → `return_requests` (order trước, như payment).
 */
@Injectable()
export class ReturnProcessingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly refundService: RefundService,
    private readonly queryService: ReturnProcessingQueryService,
  ) {}

  /** Duyệt: khách được phép gửi hàng về. `note` (hướng dẫn gửi hàng) khách thấy */
  async approve(adminId: string, returnId: string, dto: ApproveReturnDto) {
    await this.withLockedRequest(returnId, async (manager, request) => {
      assertReturnStatus(request, ['REQUESTED']);
      request.status = 'APPROVED';
      request.approvedAt = new Date();
      request.processedBy = adminId;
      request.adminNote = dto.note ?? null;
      await manager.save(request);
    });
    return this.queryService.findOneAdmin(returnId);
  }

  /** Từ chối (REQUESTED hoặc APPROVED, tức chưa nhận hàng); `note` là lý do khách thấy */
  async reject(adminId: string, returnId: string, dto: RejectReturnDto) {
    await this.withLockedRequest(returnId, async (manager, request) => {
      assertReturnStatus(request, REJECTABLE_RETURN_STATUSES);
      request.status = 'REJECTED';
      request.processedBy = adminId;
      request.adminNote = dto.note;
      await manager.save(request);
    });
    return this.queryService.findOneAdmin(returnId);
  }

  /**
   * Đã nhận và kiểm hàng: chốt số lượng chấp nhận từng dòng (mặc định đủ số khách xin trả) và tạo yêu cầu hoàn tiền.
   * Tiền hoàn = giá các dòng chấp nhận (giá lúc đặt) [+ phí ship nếu `refundShipping`], tính theo tỷ lệ trên số tiền khách đã trả.
   */
  async receive(adminId: string, returnId: string, dto: ReceiveReturnDto) {
    await this.withLockedRequest(returnId, async (manager, request, order) => {
      assertReturnStatus(request, ['APPROVED']);
      if (order.paymentStatus !== 'paid') {
        throwAppError(EReturnErrorCode.RETURN_RECEIVE_INVALID, 'The order is not in a refundable payment state');
      }

      const items = await manager.find(ReturnRequestItem, { where: { returnRequestId: request.id } });
      const accepted = this.resolveAcceptedQuantities(items, dto.items ?? []);
      const acceptedTotal = [...accepted.values()].reduce((sum, quantity) => sum + quantity, 0);
      if (acceptedTotal <= 0) {
        throwAppError(EReturnErrorCode.RETURN_RECEIVE_INVALID, 'At least one item must be accepted — reject the return request instead');
      }

      const orderItems = await manager.find(OrderItem, { where: { orderId: order.id } });
      const priceVnd = new Map(orderItems.map((orderItem) => [orderItem.id, orderItem.price]));
      const itemsVnd = items.reduce((sum, item) => sum + (priceVnd.get(item.orderItemId) ?? 0) * (accepted.get(item.id) ?? 0), 0);

      let shippingVnd = 0;
      if (dto.refundShipping) {
        if (await manager.exists(ReturnRequest, { where: { orderId: order.id, shippingRefunded: true } })) {
          throwAppError(EReturnErrorCode.RETURN_RECEIVE_INVALID, 'The shipping fee of this order has already been refunded');
        }
        shippingVnd = order.shippingFee;
      }
      const totalVnd = order.total;

      // Giá trị các lần trả đã nhận trước đó: mỗi lần hoàn tính chênh lệch luỹ kế nên tổng các lần luôn khớp số đã trả
      const earlier = await manager.find(ReturnRequest, { where: { orderId: order.id, status: In(['RECEIVED', 'REFUNDED']) } });
      const earlierItems = earlier.length
        ? await manager.find(ReturnRequestItem, { where: { returnRequestId: In(earlier.map((request) => request.id)) } })
        : [];
      const previousValueVnd =
        earlierItems.reduce((sum, item) => sum + (priceVnd.get(item.orderItemId) ?? 0) * (item.acceptedQuantity ?? 0), 0) +
        earlier.filter((request) => request.shippingRefunded).length * order.shippingFee;

      if (previousValueVnd + itemsVnd + shippingVnd > totalVnd) {
        throwAppError(EReturnErrorCode.RETURN_RECEIVE_INVALID, 'The accepted items are worth more than the order total');
      }

      await this.refundService.createForReturn(manager, {
        orderId: order.id,
        returnRequestId: request.id,
        valueVnd: itemsVnd + shippingVnd,
        previousValueVnd,
        totalVnd,
        requestedBy: adminId,
      });

      for (const item of items) item.acceptedQuantity = accepted.get(item.id) ?? 0;
      await manager.save(items);
      request.status = 'RECEIVED';
      request.receivedAt = new Date();
      request.processedBy = adminId;
      request.shippingRefunded = dto.refundShipping === true;
      if (dto.note !== undefined) request.adminNote = dto.note;
      await manager.save(request);
    });
    return this.queryService.findOneAdmin(returnId);
  }

  // ============================================
  // INTERNAL
  // ============================================

  /** Khoá đơn rồi yêu cầu (đúng thứ tự), chạy `work` trong cùng transaction */
  private async withLockedRequest(
    returnId: string,
    work: (manager: EntityManager, request: ReturnRequest, order: Order) => Promise<void>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOne(ReturnRequest, { where: { id: returnId } });
      if (!found) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      const order = await findLocked(manager, Order, { id: found.orderId });
      const request = await findLocked(manager, ReturnRequest, { id: returnId });
      if (!order || !request) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      await work(manager, request, order);
    });
  }

  /** Số lượng chấp nhận theo `return_request_items.id`: mặc định đủ số xin trả, `dto` ghi đè từng dòng (0..số xin trả) */
  private resolveAcceptedQuantities(items: ReturnRequestItem[], given: { returnItemId: string; acceptedQuantity: number }[]) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const accepted = new Map(items.map((item) => [item.id, item.quantity]));
    const seen = new Set<string>();
    for (const entry of given) {
      const item = byId.get(entry.returnItemId);
      if (!item) throwAppError(EReturnErrorCode.RETURN_RECEIVE_INVALID, `Line ${entry.returnItemId} is not part of this return request`);
      if (seen.has(entry.returnItemId))
        throwAppError(EReturnErrorCode.RETURN_RECEIVE_INVALID, `Line ${entry.returnItemId} appears more than once`);
      seen.add(entry.returnItemId);
      if (entry.acceptedQuantity > item.quantity) {
        throwAppError(
          EReturnErrorCode.RETURN_RECEIVE_INVALID,
          `Line ${entry.returnItemId}: accepted ${entry.acceptedQuantity} but only ${item.quantity} were requested`,
        );
      }
      accepted.set(entry.returnItemId, entry.acceptedQuantity);
    }
    return accepted;
  }
}
