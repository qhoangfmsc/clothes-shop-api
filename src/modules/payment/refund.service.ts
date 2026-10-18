import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EPaymentErrorCode } from '@common/exceptions/error-codes';
import { money } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Order } from '../order/order.entity';
import { ReturnRequest } from '../return/return-request.entity';
import { ReturnRequestItem } from '../return/return-request-item.entity';
import { AdminRefundQueryDto } from './dtos/admin-refund-query.dto';
import { CompleteRefundDto } from './dtos/complete-refund.dto';
import { CreateRefundDto } from './dtos/create-refund.dto';
import { RejectRefundDto } from './dtos/reject-refund.dto';
import { RefundReason, RefundStatus } from './payment.constant';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { Refund } from './refund.entity';

const UNIQUE_VIOLATION = '23505';

/**
 * Số VND hoàn cho một phần giá trị đơn, theo tỷ lệ trên số tiền khách ĐÃ trả: trả hết giá trị đơn thì đúng bằng số đã trả,
 * ngược lại làm tròn theo tỷ lệ. `valueVnd`/`totalVnd` là giá trị VND (số nguyên) của phần được hoàn và của cả đơn (`orders.total`).
 */
export function prorateRefundAmount(paidAmount: number, valueVnd: number, totalVnd: number): number {
  if (totalVnd <= 0 || valueVnd <= 0) return 0;
  if (valueVnd >= totalVnd) return paidAmount;
  return Math.round((paidAmount * valueVnd) / totalVnd);
}

/** Khoản hoàn như khách được xem (không lộ id nội bộ, người xử lý hay ghi chú nội bộ của admin) */
export interface CustomerRefund {
  /** Số tiền hoàn (VND) và giá trị USD tương ứng theo tỷ giá của đơn */
  amountVnd: number;
  amountUsd: number;
  status: RefundStatus;
  reason: RefundReason;
  /** Yêu cầu trả hàng sinh ra khoản hoàn này (chỉ khi `reason = RETURN`) */
  returnId: string | null;
  createdAt: Date;
  processedAt: Date | null;
  /** Mã giao dịch ngân hàng của lần chuyển hoàn; null cho đến khi COMPLETED */
  bankReference: string | null;
}

/**
 * Hoàn tiền cho đơn đã thanh toán. Hệ thống KHÔNG tự chuyển tiền (SePay chỉ báo tiền vào): khi đơn đã trả bị huỷ sẽ có một yêu cầu
 * `REQUESTED`; admin chuyển khoản trả khách bằng ngân hàng rồi ghi mã giao dịch → `COMPLETED` và đơn thành `payment_status = refunded`.
 *
 * Mọi thao tác khoá theo thứ tự `orders` → `refunds` (cùng thứ tự với webhook/createQr/confirm: order trước).
 */
@Injectable()
export class RefundService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
  ) {}

  /**
   * Tạo yêu cầu hoàn đủ số tiền còn lại cho đơn đã trả vừa bị huỷ. Phải gọi trong transaction đã khoá dòng đơn (huỷ đơn).
   * Số tiền = số của phiên thanh toán `PAID` trừ các khoản đã hoàn xong.
   */
  async createForCancelledOrder(manager: EntityManager, orderId: string, requestedBy: string | null): Promise<Refund> {
    return this.insertRequest(manager, { orderId, reason: 'ADMIN_CANCELLED', requestedBy, returnRequestId: null, valueVnd: null });
  }

  /**
   * Tạo yêu cầu hoàn cho hàng khách trả lại (module return, lúc cửa hàng nhận hàng). Phải gọi trong transaction đã khoá dòng đơn.
   * Số tiền = phần giá trị đơn được hoàn trên số tiền ngân hàng đã nhận, không vượt phần còn lại. Để nhiều lần trả hàng cộng lại
   * đúng bằng số đã nhận (không lệch do làm tròn), mỗi lần = hoàn(đã trả trước + lần này) − hoàn(đã trả trước), theo `previousValueVnd`.
   */
  async createForReturn(
    manager: EntityManager,
    params: {
      orderId: string;
      returnRequestId: string;
      valueVnd: number;
      previousValueVnd: number;
      totalVnd: number;
      requestedBy: string;
    },
  ): Promise<Refund> {
    return this.insertRequest(manager, { ...params, reason: 'RETURN' });
  }

  private async insertRequest(
    manager: EntityManager,
    params: {
      orderId: string;
      reason: RefundReason;
      requestedBy: string | null;
      returnRequestId: string | null;
      /** `null` = hoàn toàn bộ phần còn lại; ngược lại hoàn theo tỷ lệ `valueVnd / totalVnd` */
      valueVnd: number | null;
      /** Giá trị (VND) của các lần trả hàng đã nhận trước đó của đơn */
      previousValueVnd?: number;
      totalVnd?: number;
    },
  ): Promise<Refund> {
    const { orderId } = params;
    const attempt = await manager.findOne(PaymentAttempt, { where: { orderId, status: 'PAID' } });
    if (!attempt) throwAppError(EPaymentErrorCode.REFUND_NOT_ALLOWED, 'The order has no paid payment session to refund');

    if (await manager.exists(Refund, { where: { orderId, status: 'REQUESTED' } })) {
      throwAppError(EPaymentErrorCode.REFUND_NOT_ALLOWED, 'A refund request for this order is already waiting — finish it first');
    }
    // Gốc để hoàn là số tiền NGÂN HÀNG THỰC NHẬN (có thể khác số của phiên QR khi admin xác nhận thủ công kèm chấp nhận lệch)
    const paid = await this.receivedAmount(manager, attempt);
    const remaining = paid - (await this.sumCompleted(manager, orderId));
    if (remaining <= 0) throwAppError(EPaymentErrorCode.REFUND_NOT_ALLOWED, 'This order has already been fully refunded');

    const total = params.totalVnd ?? 0;
    const previous = params.previousValueVnd ?? 0;
    const wanted =
      params.valueVnd === null
        ? remaining
        : prorateRefundAmount(paid, previous + params.valueVnd, total) - prorateRefundAmount(paid, previous, total);
    const amount = Math.min(wanted, remaining);
    if (amount <= 0) throwAppError(EPaymentErrorCode.REFUND_NOT_ALLOWED, 'There is nothing to refund');

    return manager.save(
      manager.create(Refund, {
        orderId,
        paymentAttemptId: attempt.id,
        returnRequestId: params.returnRequestId,
        amount,
        status: 'REQUESTED',
        reason: params.reason,
        requestedBy: params.requestedBy,
        processedBy: null,
        processedAt: null,
        bankReference: null,
        note: null,
      }),
    );
  }

  /** Số khoản hoàn đang chờ admin chuyển khoản (`status = REQUESTED`) — bằng `total` của `findAdmin({ status: 'REQUESTED' })` */
  async countRequested(): Promise<number> {
    return this.refundRepo.count({ where: { status: 'REQUESTED' } });
  }

  /** Các khoản hoàn của một đơn cho khách xem, mới nhất trước (`[]` nếu chưa có). Quyền sở hữu đơn do nơi gọi kiểm tra */
  async listForCustomer(order: { id: string; exchangeRate: number }): Promise<CustomerRefund[]> {
    const refunds = await this.refundRepo.find({ where: { orderId: order.id }, order: { createdAt: 'DESC' } });
    return refunds.map((refund) => ({
      ...money('amount', refund.amount, order.exchangeRate),
      status: refund.status,
      reason: refund.reason,
      returnId: refund.returnRequestId,
      createdAt: refund.createdAt,
      processedAt: refund.processedAt,
      bankReference: refund.bankReference,
    }));
  }

  /** [Admin] Danh sách yêu cầu hoàn tiền, kèm đơn, khách và thông tin khoản đã nhận để biết hoàn về đâu */
  async findAdmin(query: AdminRefundQueryDto) {
    const { orderId, status, search, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.adminQueryBuilder();
    if (orderId) qb.andWhere('r.order_id = :orderId', { orderId });
    if (status) qb.andWhere('r.status = :status', { status });
    if (search) {
      qb.andWhere(
        "(r.order_id ILIKE :search OR r.bank_reference ILIKE :search OR a.transfer_code ILIKE :search OR o.shipping_address->>'phone' ILIKE :search OR o.shipping_address->>'fullName' ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`r.${field}`, direction);
    qb.skip((page - 1) * limit).take(limit);

    const [refunds, total] = await qb.getManyAndCount();
    return paginated(await this.toAdminViews(refunds), total, page, limit);
  }

  /** [Admin] Tạo yêu cầu hoàn cho đơn ĐÃ HUỶ mà đã thu tiền (đơn huỷ trước khi có luồng hoàn tiền, hoặc yêu cầu cũ đã bị từ chối) */
  async createAdmin(adminId: string, dto: CreateRefundDto) {
    const refund = await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, { where: { id: dto.orderId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      if (order.status !== 'cancelled' || order.paymentStatus !== 'paid') {
        throwAppError(
          EPaymentErrorCode.REFUND_NOT_ALLOWED,
          'Only a cancelled order that has been paid and not fully refunded can be refunded',
        );
      }
      return this.createForCancelledOrder(manager, order.id, adminId);
    });
    return { data: await this.getAdminView(refund.id) };
  }

  /**
   * [Admin] Đã chuyển khoản trả khách: ghi mã giao dịch hoàn. Khi tổng các khoản đã hoàn bằng số tiền khách đã trả,
   * đơn chuyển `payment_status = refunded`.
   */
  async completeAdmin(adminId: string, refundId: string, dto: CompleteRefundDto) {
    const found = await this.refundRepo.findOne({ where: { id: refundId } });
    if (!found) throwAppError(EPaymentErrorCode.REFUND_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    try {
      await this.dataSource.transaction(async (manager) => {
        const order = await manager.findOne(Order, { where: { id: found.orderId }, lock: { mode: 'pessimistic_write' } });
        const refund = await manager.findOne(Refund, { where: { id: refundId }, lock: { mode: 'pessimistic_write' } });
        if (!order || !refund) throwAppError(EPaymentErrorCode.REFUND_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
        if (refund.status !== 'REQUESTED') {
          throwAppError(EPaymentErrorCode.REFUND_NOT_PENDING, `This refund is already ${refund.status}`);
        }
        if (await manager.exists(Refund, { where: { bankReference: dto.reference } })) {
          throwAppError(EPaymentErrorCode.REFUND_REFERENCE_DUPLICATE);
        }

        const attempt = await manager.findOne(PaymentAttempt, { where: { id: refund.paymentAttemptId } });
        const paid = attempt ? await this.receivedAmount(manager, attempt) : 0;
        const refundedAfter = (await this.sumCompleted(manager, order.id)) + refund.amount;
        // Không bao giờ hoàn quá số tiền ngân hàng đã nhận
        if (!attempt || refundedAfter > paid) {
          throwAppError(EPaymentErrorCode.REFUND_NOT_ALLOWED, 'The refunds of this order would exceed the amount the customer paid');
        }

        refund.status = 'COMPLETED';
        refund.processedBy = adminId;
        refund.processedAt = new Date();
        refund.bankReference = dto.reference;
        refund.note = dto.note;
        await manager.save(refund);
        if (refundedAfter === paid) await manager.update(Order, { id: order.id }, { paymentStatus: 'refunded' });
        // Khoản hoàn của yêu cầu trả hàng: yêu cầu đó xong
        if (refund.returnRequestId)
          await manager.update(ReturnRequest, { id: refund.returnRequestId, status: 'RECEIVED' }, { status: 'REFUNDED' });
      });
    } catch (error) {
      // Hai khoản hoàn (hai đơn khác nhau) cùng được ghi một mã giao dịch ngân hàng cùng lúc: chốt chặn là UNIQUE ở DB
      if ((error as { code?: string })?.code === UNIQUE_VIOLATION) throwAppError(EPaymentErrorCode.REFUND_REFERENCE_DUPLICATE);
      throw error;
    }
    return { data: await this.getAdminView(refundId) };
  }

  /** [Admin] Không hoàn tiền (có lý do). Đơn giữ nguyên `paid`; đơn đã huỷ thì tạo lại yêu cầu sau này, khoản hoàn của yêu cầu trả hàng thì đưa yêu cầu trả hàng về APPROVED */
  async rejectAdmin(adminId: string, refundId: string, dto: RejectRefundDto) {
    const found = await this.refundRepo.findOne({ where: { id: refundId } });
    if (!found) throwAppError(EPaymentErrorCode.REFUND_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    await this.dataSource.transaction(async (manager) => {
      await manager.findOne(Order, { where: { id: found.orderId }, lock: { mode: 'pessimistic_write' } });
      const refund = await manager.findOne(Refund, { where: { id: refundId }, lock: { mode: 'pessimistic_write' } });
      if (!refund) throwAppError(EPaymentErrorCode.REFUND_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      if (refund.status !== 'REQUESTED') {
        throwAppError(EPaymentErrorCode.REFUND_NOT_PENDING, `This refund is already ${refund.status}`);
      }
      refund.status = 'REJECTED';
      refund.processedBy = adminId;
      refund.processedAt = new Date();
      refund.note = dto.note;
      await manager.save(refund);
      // Không hoàn cho hàng đã trả: yêu cầu trả hàng quay về APPROVED để cửa hàng nhận/chốt lại số lượng và tạo lại khoản hoàn
      if (refund.returnRequestId) {
        await manager.update(
          ReturnRequest,
          { id: refund.returnRequestId, status: 'RECEIVED' },
          { status: 'APPROVED', receivedAt: null, shippingRefunded: false },
        );
        await manager.update(ReturnRequestItem, { returnRequestId: refund.returnRequestId }, { acceptedQuantity: null });
      }
    });
    return { data: await this.getAdminView(refundId) };
  }

  /**
   * Số tiền ngân hàng thực nhận cho phiên `PAID`: số của giao dịch đã khớp (webhook `MATCHED` hoặc admin xác nhận thủ công).
   * Thường bằng `payment_attempts.amount`; khác nhau khi admin xác nhận thủ công kèm `acceptAmountMismatch`.
   */
  private async receivedAmount(manager: EntityManager, attempt: PaymentAttempt): Promise<number> {
    const matched = await manager.find(PaymentTransaction, {
      where: { paymentAttemptId: attempt.id, verificationStatus: In(['MATCHED', 'MANUALLY_CONFIRMED']) },
    });
    return matched[0]?.amount ?? attempt.amount;
  }

  /** Tổng các khoản đã hoàn xong của đơn */
  private async sumCompleted(manager: EntityManager, orderId: string): Promise<number> {
    const completed = await manager.find(Refund, { where: { orderId, status: 'COMPLETED' } });
    return completed.reduce((sum, refund) => sum + refund.amount, 0);
  }

  /** Chỉ lấy các cột của đơn và phiên được trả ra (không kéo cả bản ghi) */
  private adminQueryBuilder() {
    return this.refundRepo
      .createQueryBuilder('r')
      .innerJoin('r.order', 'o')
      .addSelect(['o.id', 'o.status', 'o.paymentStatus', 'o.total', 'o.exchangeRate', 'o.userId', 'o.shippingAddress'])
      .innerJoin('r.paymentAttempt', 'a')
      .addSelect(['a.id', 'a.transferCode', 'a.amount', 'a.paidAt']);
  }

  private async getAdminView(refundId: string) {
    const refund = await this.adminQueryBuilder().where('r.id = :refundId', { refundId }).getOne();
    if (!refund) throwAppError(EPaymentErrorCode.REFUND_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    return (await this.toAdminViews([refund]))[0];
  }

  /**
   * `payment` cho admin biết khoản tiền đã nhận để hoàn về đúng nguồn: mã chuyển khoản của phiên, mã giao dịch ngân hàng/SePay
   * và nội dung chuyển khoản đúng như trên sao kê.
   */
  private async toAdminViews(refunds: Refund[]) {
    const attemptIds = [...new Set(refunds.map((refund) => refund.paymentAttemptId))];
    const matched = attemptIds.length
      ? await this.transactionRepo.find({
          where: { paymentAttemptId: In(attemptIds), verificationStatus: In(['MATCHED', 'MANUALLY_CONFIRMED']) },
        })
      : [];
    const txByAttempt = new Map(matched.map((tx) => [tx.paymentAttemptId, tx]));

    return refunds.map((refund) => {
      const tx = txByAttempt.get(refund.paymentAttemptId);
      return {
        id: refund.id,
        orderId: refund.orderId,
        status: refund.status,
        reason: refund.reason,
        returnRequestId: refund.returnRequestId,
        ...money('amount', refund.amount, refund.order.exchangeRate),
        createdAt: refund.createdAt,
        requestedBy: refund.requestedBy,
        processedBy: refund.processedBy,
        processedAt: refund.processedAt,
        bankReference: refund.bankReference,
        note: refund.note,
        order: {
          id: refund.order.id,
          status: refund.order.status,
          paymentStatus: refund.order.paymentStatus,
          ...money('total', refund.order.total, refund.order.exchangeRate),
          exchangeRate: refund.order.exchangeRate,
          userId: refund.order.userId,
          customer: { fullName: refund.order.shippingAddress?.fullName ?? null, phone: refund.order.shippingAddress?.phone ?? null },
        },
        payment: {
          transferCode: refund.paymentAttempt.transferCode,
          ...money('paidAmount', tx?.amount ?? refund.paymentAttempt.amount, refund.order.exchangeRate),
          paidAt: refund.paymentAttempt.paidAt,
          provider: tx?.provider ?? null,
          transactionRef: tx?.providerTransactionId ?? null,
          transferContent: tx?.transferContent ?? null,
        },
      };
    });
  }
}
