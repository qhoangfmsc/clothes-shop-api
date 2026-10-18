import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EReturnErrorCode } from '@common/exceptions/error-codes';
import { money, moneyOrNull } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { Refund } from '../payment/refund.entity';
import { RefundService } from '../payment/refund.service';
import { ShippingConfigService } from '../shipping/shipping-config.service';
import { AdminReturnQueryDto } from './dtos/admin-return-query.dto';
import { ApproveReturnDto } from './dtos/approve-return.dto';
import { CreateReturnDto } from './dtos/create-return.dto';
import { PublicReturnQueryDto } from './dtos/public-return-query.dto';
import { ReceiveReturnDto } from './dtos/receive-return.dto';
import { RejectReturnDto } from './dtos/reject-return.dto';
import {
  ACTIVE_RETURN_STATUSES,
  CUSTOMER_CANCELLABLE_RETURN_STATUSES,
  REJECTABLE_RETURN_STATUSES,
  ReturnReason,
  ReturnStatus,
} from './return.constant';
import { computeReturnEligibility, RETURN_INELIGIBLE_MESSAGES } from './return-eligibility.util';
import { ReturnRequest } from './return-request.entity';
import { ReturnRequestItem } from './return-request-item.entity';

/**
 * Trả hàng sau khi giao. Luồng: khách gửi yêu cầu (REQUESTED) → cửa hàng duyệt (APPROVED) → khách gửi hàng về → cửa hàng nhận và
 * kiểm hàng (RECEIVED, tạo yêu cầu hoàn tiền ở module payment) → admin chuyển khoản hoàn (REFUNDED, do module payment cập nhật).
 * "Đổi" không có luồng riêng: trả hàng được hoàn tiền rồi khách đặt đơn mới.
 *
 * Mọi thao tác ghi khoá theo thứ tự `orders` → `return_requests` (order trước, như payment).
 */
@Injectable()
export class ReturnService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ReturnRequest)
    private readonly returnRepo: Repository<ReturnRequest>,
    private readonly shippingConfigService: ShippingConfigService,
    private readonly refundService: RefundService,
  ) {}

  // ============================================
  // CUSTOMER
  // ============================================

  /** Đơn có trả hàng được không và từng dòng còn trả được bao nhiêu (để FE hiện/ẩn nút và giới hạn số lượng) */
  async getEligibility(userId: string, orderId: string) {
    const manager = this.dataSource.manager;
    const order = await manager.findOne(Order, { where: { id: orderId, userId } });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    const returnWindowDays = (await this.shippingConfigService.get()).returnPolicy.days;
    const items = await manager.find(OrderItem, { where: { orderId } });
    const activeQuantities = await this.activeQuantities(manager, orderId);
    return { data: { orderId, ...computeReturnEligibility({ order, items, activeQuantities, returnWindowDays }) } };
  }

  async create(userId: string, dto: CreateReturnDto) {
    const returnWindowDays = (await this.shippingConfigService.get()).returnPolicy.days;

    const created = await this.dataSource.transaction(async (manager) => {
      // Khoá đơn: hai yêu cầu đồng thời cho cùng một dòng hàng phải tuần tự, nên không thể trả quá số lượng đã mua
      const order = await manager.findOne(Order, { where: { id: dto.orderId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

      const items = await manager.find(OrderItem, { where: { orderId: order.id } });
      const eligibility = computeReturnEligibility({
        order,
        items,
        activeQuantities: await this.activeQuantities(manager, order.id),
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

    return { data: await this.getView(created.id, false) };
  }

  async findAll(userId: string, query: PublicReturnQueryDto) {
    const { status, orderId, sort } = query;
    const { page, limit } = getPaging(query);
    const { field, direction } = parseSort(sort, '-createdAt');

    const [requests, total] = await this.returnRepo.findAndCount({
      where: { order: { userId }, ...(status ? { status: status as ReturnStatus } : {}), ...(orderId ? { orderId } : {}) },
      order: { [field]: direction },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginated(await this.toViews(requests, false), total, page, limit);
  }

  async findOne(userId: string, returnId: string) {
    const request = await this.dataSource.manager.findOne(ReturnRequest, { where: { id: returnId } });
    const owned = request && (await this.dataSource.manager.exists(Order, { where: { id: request.orderId, userId } }));
    if (!request || !owned) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    return { data: (await this.toViews([request], false))[0] };
  }

  /** Khách huỷ yêu cầu của mình khi chưa gửi hàng tới cửa hàng (REQUESTED hoặc APPROVED) */
  async cancel(userId: string, returnId: string) {
    await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOne(ReturnRequest, { where: { id: returnId } });
      const order = found && (await manager.findOne(Order, { where: { id: found.orderId, userId }, lock: { mode: 'pessimistic_write' } }));
      if (!found || !order) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      const request = await manager.findOne(ReturnRequest, { where: { id: returnId }, lock: { mode: 'pessimistic_write' } });
      this.assertStatus(request, CUSTOMER_CANCELLABLE_RETURN_STATUSES);
      request.status = 'CANCELLED';
      await manager.save(request);
    });
    return this.findOne(userId, returnId);
  }

  // ============================================
  // ADMIN
  // ============================================

  async findAllAdmin(query: AdminReturnQueryDto) {
    const { status, orderId, search, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.returnRepo.createQueryBuilder('r').innerJoin('r.order', 'o').addSelect(['o.id', 'o.shippingAddress']);
    if (status) qb.andWhere('r.status = :status', { status });
    if (orderId) qb.andWhere('r.order_id = :orderId', { orderId });
    if (search) {
      qb.andWhere(
        "(r.id ILIKE :search OR r.order_id ILIKE :search OR o.shipping_address->>'phone' ILIKE :search OR o.shipping_address->>'fullName' ILIKE :search)",
        {
          search: `%${search}%`,
        },
      );
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`r.${field}`, direction);
    qb.skip((page - 1) * limit).take(limit);

    const [requests, total] = await qb.getManyAndCount();
    return paginated(await this.toViews(requests, true), total, page, limit);
  }

  /** Số yêu cầu chờ duyệt (`status = REQUESTED`) — bằng `total` của `findAllAdmin({ status: 'REQUESTED' })`; `APPROVED` đang chờ khách gửi hàng nên không tính */
  async countRequested(): Promise<number> {
    return this.returnRepo.count({ where: { status: 'REQUESTED' } });
  }

  async findOneAdmin(returnId: string) {
    return { data: await this.getView(returnId, true) };
  }

  /** Duyệt: khách được phép gửi hàng về. `note` (hướng dẫn gửi hàng) khách thấy */
  async approve(adminId: string, returnId: string, dto: ApproveReturnDto) {
    await this.withLockedRequest(returnId, async (manager, request) => {
      this.assertStatus(request, ['REQUESTED']);
      request.status = 'APPROVED';
      request.approvedAt = new Date();
      request.processedBy = adminId;
      request.adminNote = dto.note ?? null;
      await manager.save(request);
    });
    return this.findOneAdmin(returnId);
  }

  /** Từ chối (REQUESTED hoặc APPROVED, tức chưa nhận hàng); `note` là lý do khách thấy */
  async reject(adminId: string, returnId: string, dto: RejectReturnDto) {
    await this.withLockedRequest(returnId, async (manager, request) => {
      this.assertStatus(request, REJECTABLE_RETURN_STATUSES);
      request.status = 'REJECTED';
      request.processedBy = adminId;
      request.adminNote = dto.note;
      await manager.save(request);
    });
    return this.findOneAdmin(returnId);
  }

  /**
   * Đã nhận và kiểm hàng: chốt số lượng chấp nhận từng dòng (mặc định đủ số khách xin trả) và tạo yêu cầu hoàn tiền.
   * Tiền hoàn = giá các dòng chấp nhận (giá lúc đặt) [+ phí ship nếu `refundShipping`], tính theo tỷ lệ trên số tiền khách đã trả.
   */
  async receive(adminId: string, returnId: string, dto: ReceiveReturnDto) {
    await this.withLockedRequest(returnId, async (manager, request, order) => {
      this.assertStatus(request, ['APPROVED']);
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
    return this.findOneAdmin(returnId);
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
      const order = await manager.findOne(Order, { where: { id: found.orderId }, lock: { mode: 'pessimistic_write' } });
      const request = await manager.findOne(ReturnRequest, { where: { id: returnId }, lock: { mode: 'pessimistic_write' } });
      if (!order || !request) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      await work(manager, request, order);
    });
  }

  private assertStatus(request: ReturnRequest | null, allowed: readonly ReturnStatus[]): asserts request is ReturnRequest {
    if (!request) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    if (!allowed.includes(request.status)) {
      throwAppError(
        EReturnErrorCode.RETURN_INVALID_STATE,
        `The return request is ${request.status}; allowed only when ${allowed.join(' or ')}`,
      );
    }
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

  /** Số lượng từng dòng đơn đã nằm trong các yêu cầu còn hiệu lực */
  private async activeQuantities(manager: EntityManager, orderId: string): Promise<Map<string, number>> {
    const requests = await manager.find(ReturnRequest, { where: { orderId, status: In([...ACTIVE_RETURN_STATUSES]) } });
    const items = requests.length
      ? await manager.find(ReturnRequestItem, { where: { returnRequestId: In(requests.map((request) => request.id)) } })
      : [];
    const quantities = new Map<string, number>();
    for (const item of items) quantities.set(item.orderItemId, (quantities.get(item.orderItemId) ?? 0) + item.quantity);
    return quantities;
  }

  private async getView(returnId: string, admin: boolean) {
    const request = await this.dataSource.manager.findOne(ReturnRequest, { where: { id: returnId } });
    if (!request) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    return (await this.toViews([request], admin))[0];
  }

  /**
   * Khách và admin cùng một shape; admin có thêm người xử lý, đơn và khách. Khoản hoàn gắn với yêu cầu: khoản mới nhất
   * (yêu cầu có thể có nhiều khoản nếu khoản trước bị từ chối rồi nhận lại).
   */
  private async toViews(requests: ReturnRequest[], admin: boolean) {
    if (!requests.length) return [];
    const manager = this.dataSource.manager;
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
}
