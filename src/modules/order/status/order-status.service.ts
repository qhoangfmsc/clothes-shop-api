import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PaymentAttemptService } from '../../payment/attempt/payment-attempt.service';
import { RefundService } from '../../refund/refund.service';
import { OrderQueryService } from '../query/order-query.service';
import { ORDER_TRANSITIONS } from '../shared/order.constant';
import { Order } from '../shared/order.entity';
import { UpdateOrderStatusDto } from './dtos/admin-order.dto';

/** Huỷ đơn (khách) và đổi trạng thái đơn (admin). */
@Injectable()
export class OrderStatusService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly paymentService: PaymentAttemptService,
    private readonly refundService: RefundService,
    private readonly queryService: OrderQueryService,
  ) {}

  /**
   * Khách chỉ huỷ được đơn CHƯA thanh toán và còn `pending`. Đơn đã thanh toán (tự sang `confirmed` ngay khi trả tiền) khách không
   * tự huỷ: phải liên hệ cửa hàng, admin huỷ và hoàn tiền (xem `updateStatus`).
   */
  async cancel(userId: string, orderId: string) {
    await this.dataSource.transaction(async (manager) => {
      // Khoá dòng đơn: không đua với webhook đang ghi nhận thanh toán cho đúng đơn này (thứ tự khoá order → attempt như payment)
      const order = await findLocked(manager, Order, { id: orderId, userId });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

      if (order.paymentStatus === 'unpaid') {
        if (order.status !== 'pending') throwAppError(EOrderErrorCode.ORDER_CANCEL_NOT_ALLOWED);
      } else {
        if (order.status === 'cancelled') throwAppError(EOrderErrorCode.ORDER_ALREADY_CANCELLED);
        throwAppError(EOrderErrorCode.ORDER_CANCEL_PAID_NOT_ALLOWED);
      }

      // Đơn chưa trả nên không có khoản hoàn
      await this.cancelLocked(manager, order, null);
    });
    return this.queryService.findOne(userId, orderId);
  }

  /**
   * Huỷ một đơn đã được khoá: đổi `cancelled`, các mã chuyển khoản còn chờ → `CANCELLED`, và nếu đơn đã trả tiền (chỉ admin huỷ được)
   * thì tạo yêu cầu hoàn tiền — tất cả trong transaction của nơi gọi, nên không bao giờ có đơn huỷ đã thu tiền mà thiếu yêu cầu hoàn.
   */
  private async cancelLocked(manager: EntityManager, order: Order, adminId: string | null) {
    // Yêu cầu hoàn tiền trước: nếu không tạo được (đơn đã trả mà không có phiên PAID) thì không đổi gì cả
    if (order.paymentStatus === 'paid') await this.refundService.createForCancelledOrder(manager, order.id, adminId);
    await manager.update(Order, { id: order.id }, { status: 'cancelled' });
    order.status = 'cancelled';
    await this.paymentService.cancelPendingAttempts(order.id, manager);
  }

  async updateStatus(adminId: string, orderId: string, dto: UpdateOrderStatusDto) {
    await this.dataSource.transaction(async (manager) => {
      const order = await findLocked(manager, Order, { id: orderId });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND);

      // Validate status transition (trên bản đã khoá: không đua với thanh toán hay huỷ đồng thời)
      const allowed = ORDER_TRANSITIONS[order.status];
      if (!allowed.includes(dto.status)) {
        throwAppError(
          EOrderErrorCode.ORDER_STATUS_INVALID_TRANSITION,
          `Cannot change status from '${order.status}' to '${dto.status}'. Allowed transitions: ${allowed.join(', ') || 'none'}`,
        );
      }

      if (dto.status === 'cancelled') {
        // Đơn đã trả mà bị huỷ → tự có yêu cầu hoàn tiền
        await this.cancelLocked(manager, order, adminId);
      } else {
        // `delivered` là mốc bắt đầu hạn đổi trả
        await manager.update(
          Order,
          { id: order.id },
          { status: dto.status, ...(dto.status === 'delivered' ? { deliveredAt: new Date() } : {}) },
        );
      }
    });

    return this.queryService.findOneAdmin(orderId);
  }
}
