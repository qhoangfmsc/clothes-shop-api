import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EReturnErrorCode } from '@common/exceptions/error-codes';
import { money, moneyOrNull } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { Refund } from '../payment/refund.entity';
import { ShippingConfigService } from '../shipping/shipping-config.service';
import { AdminReturnQueryDto } from './dtos/admin-return-query.dto';
import { PublicReturnQueryDto } from './dtos/public-return-query.dto';
import { ReturnStatus } from './return.constant';
import { activeReturnQuantities } from './return-active-quantities.util';
import { computeReturnEligibility } from './return-eligibility.util';
import { ReturnRequest } from './return-request.entity';
import { ReturnRequestItem } from './return-request-item.entity';

@Injectable()
export class ReturnQueryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ReturnRequest)
    private readonly returnRepo: Repository<ReturnRequest>,
    private readonly shippingConfigService: ShippingConfigService,
  ) {}

  /** Đơn có trả hàng được không và từng dòng còn trả được bao nhiêu (để FE hiện/ẩn nút và giới hạn số lượng) */
  async getEligibility(userId: string, orderId: string) {
    const manager = this.dataSource.manager;
    const order = await manager.findOne(Order, { where: { id: orderId, userId } });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    const returnWindowDays = (await this.shippingConfigService.get()).returnPolicy.days;
    const items = await manager.find(OrderItem, { where: { orderId } });
    const activeQuantities = await activeReturnQuantities(manager, orderId);
    return { data: { orderId, ...computeReturnEligibility({ order, items, activeQuantities, returnWindowDays }) } };
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

  async getView(returnId: string, admin: boolean) {
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
