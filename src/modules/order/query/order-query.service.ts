import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { PaymentAttemptQueryService } from '../../payment/attempt/payment-attempt-query.service';
import { RefundQueryService } from '../../refund/refund-query.service';
import { ORDER_RELATIONS } from '../shared/order.constant';
import { Order } from '../shared/order.entity';
import { presentOrder } from '../shared/order.presenter';
import { AdminOrderQueryDto } from './dtos/admin-order-query.dto';
import { PublicOrderQueryDto } from './dtos/public-order-query.dto';
import { applyOrderNeedsActionFilter } from './order-needs-action.util';

const joinItems = (qb: SelectQueryBuilder<Order>) =>
  qb
    .leftJoinAndSelect('o.items', 'items')
    .leftJoinAndSelect('items.product', 'product')
    .leftJoinAndSelect('product.category', 'cat')
    .leftJoinAndSelect('product.subcategory', 'sub');

/** Đọc đơn: danh sách, chi tiết (khách và admin) và số đơn cần admin thao tác. */
@Injectable()
export class OrderQueryService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly paymentService: PaymentAttemptQueryService,
    private readonly refundService: RefundQueryService,
  ) {}

  async findAll(userId: string, query: PublicOrderQueryDto = {}) {
    const { status, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = joinItems(this.orderRepo.createQueryBuilder('o')).where('o.userId = :userId', { userId });

    // Filter by status
    if (status) {
      qb.andWhere('o.status = :status', { status });
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`o.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return paginated(data.map(presentOrder), total, page, limit);
  }

  async findOne(userId: string, orderId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, userId },
      relations: ORDER_RELATIONS,
    });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    // Kèm các nội dung chuyển khoản đã cấp cho đơn (kể cả đã hết hạn) để khách xem lại và đọc cho cửa hàng, và các khoản hoàn tiền
    const [paymentAttempts, refunds] = await Promise.all([
      this.paymentService.listAttemptsForCustomer(order),
      this.refundService.listForCustomer(order),
    ]);
    return { data: { ...presentOrder(order), paymentAttempts, refunds } };
  }

  async findAllAdmin(query: AdminOrderQueryDto) {
    const { userId, search, status, paymentStatus, needsAction, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = joinItems(this.orderRepo.createQueryBuilder('o'));

    // Filter by userId
    if (userId) {
      qb.andWhere('o.user_id = :userId', { userId });
    }

    // Filter by status
    if (status) {
      qb.andWhere('o.status = :status', { status });
    }

    // Chỉ đơn cần admin thao tác (cùng điều kiện với con số trên menu admin)
    if (needsAction) applyOrderNeedsActionFilter(qb);

    // Filter by payment status (unpaid | paid)
    if (paymentStatus) {
      qb.andWhere('o.payment_status = :paymentStatus', { paymentStatus });
    }

    // Search: id, phone, fullName (phone & fullName nằm trong JSONB shipping_address)
    if (search) {
      qb.andWhere(
        "(o.id ILIKE :search OR o.shipping_address->>'phone' ILIKE :search OR o.shipping_address->>'fullName' ILIKE :search OR EXISTS (SELECT 1 FROM payment_attempts pa WHERE pa.order_id = o.id AND pa.transfer_code ILIKE :search))",
        {
          search: `%${search}%`,
        },
      );
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`o.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return paginated(data.map(presentOrder), total, page, limit);
  }

  /** Số đơn cần admin thao tác — cùng điều kiện với bộ lọc `needsAction` của `findAllAdmin` */
  async countNeedsAction(): Promise<number> {
    return applyOrderNeedsActionFilter(this.orderRepo.createQueryBuilder('o')).getCount();
  }

  async findOneAdmin(orderId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ORDER_RELATIONS,
    });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND);
    return { data: presentOrder(order) };
  }
}
