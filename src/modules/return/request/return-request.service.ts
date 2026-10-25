import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EReturnErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Order } from '../../order/shared/order.entity';
import { OrderItem } from '../../order/shared/order-item.entity';
import { ShippingConfigService } from '../../shipping/shipping-config.service';
import { CUSTOMER_CANCELLABLE_RETURN_STATUSES, ReturnReason } from '../shared/return.constant';
import { activeReturnQuantities } from '../shared/return-active-quantities.util';
import { computeReturnEligibility, RETURN_INELIGIBLE_MESSAGES } from '../shared/return-eligibility.util';
import { ReturnRequest } from '../shared/return-request.entity';
import { ReturnRequestItem } from '../shared/return-request-item.entity';
import { assertReturnStatus } from '../shared/return-status.util';
import { findReturnView } from '../shared/return-view.util';
import { CreateReturnDto } from './dtos/create-return.dto';
import { ReturnRequestQueryService } from './return-request-query.service';

@Injectable()
export class ReturnRequestService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly shippingConfigService: ShippingConfigService,
    private readonly queryService: ReturnRequestQueryService,
  ) {}

  async create(userId: string, dto: CreateReturnDto) {
    const returnWindowDays = (await this.shippingConfigService.get()).returnPolicy.days;

    const created = await this.dataSource.transaction(async (manager) => {
      // Khoá đơn: hai yêu cầu đồng thời cho cùng một dòng hàng phải tuần tự, nên không thể trả quá số lượng đã mua
      const order = await findLocked(manager, Order, { id: dto.orderId, userId });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

      const items = await manager.find(OrderItem, { where: { orderId: order.id } });
      const eligibility = computeReturnEligibility({
        order,
        items,
        activeQuantities: await activeReturnQuantities(manager, order.id),
        returnWindowDays,
      });
      if (!eligibility.eligible) {
        throwAppError(
          EReturnErrorCode.RETURN_NOT_ALLOWED,
          RETURN_INELIGIBLE_MESSAGES[eligibility.reason as keyof typeof RETURN_INELIGIBLE_MESSAGES],
        );
      }

      const returnable = new Map(eligibility.items.map((item) => [item.orderItemId, item.returnableQuantity]));
      const seen = new Set<string>();
      for (const item of dto.items) {
        if (seen.has(item.orderItemId))
          throwAppError(EReturnErrorCode.RETURN_ITEM_INVALID, `Item ${item.orderItemId} appears more than once`);
        seen.add(item.orderItemId);
        const max = returnable.get(item.orderItemId);
        if (max === undefined)
          throwAppError(EReturnErrorCode.RETURN_ITEM_INVALID, `Item ${item.orderItemId} does not belong to this order`);
        if (item.quantity > max) {
          throwAppError(
            EReturnErrorCode.RETURN_ITEM_INVALID,
            `Item ${item.orderItemId}: only ${max} can still be returned, requested ${item.quantity}`,
          );
        }
      }

      const request = await manager.save(
        manager.create(ReturnRequest, {
          orderId: order.id,
          status: 'REQUESTED',
          reason: dto.reason as ReturnReason,
          note: dto.note ?? '',
          adminNote: null,
          requestedBy: userId,
          processedBy: null,
          approvedAt: null,
          receivedAt: null,
          shippingRefunded: false,
        }),
      );
      await manager.save(
        dto.items.map((item) =>
          manager.create(ReturnRequestItem, {
            returnRequestId: request.id,
            orderItemId: item.orderItemId,
            quantity: item.quantity,
            acceptedQuantity: null,
          }),
        ),
      );
      return request;
    });

    return { data: await findReturnView(this.dataSource.manager, created.id, false) };
  }

  /** Khách huỷ yêu cầu của mình khi chưa gửi hàng tới cửa hàng (REQUESTED hoặc APPROVED) */
  async cancel(userId: string, returnId: string) {
    await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOne(ReturnRequest, { where: { id: returnId } });
      const order = found && (await findLocked(manager, Order, { id: found.orderId, userId }));
      if (!found || !order) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      const request = await findLocked(manager, ReturnRequest, { id: returnId });
      assertReturnStatus(request, CUSTOMER_CANCELLABLE_RETURN_STATUSES);
      request.status = 'CANCELLED';
      await manager.save(request);
    });
    return this.queryService.findOne(userId, returnId);
  }

  // ============================================
  // ADMIN
  // ============================================
}
