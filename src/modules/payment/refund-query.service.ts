import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EPaymentErrorCode } from '@common/exceptions/error-codes';
import { money } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AdminRefundQueryDto } from './dtos/admin-refund-query.dto';
import { RefundReason, RefundStatus } from './payment.constant';
import { PaymentTransaction } from './payment-transaction.entity';
import { Refund } from './refund.entity';

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

@Injectable()
export class RefundQueryService {
  constructor(
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
  ) {}

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

  /** Chỉ lấy các cột của đơn và phiên được trả ra (không kéo cả bản ghi) */
  private adminQueryBuilder() {
    return this.refundRepo
      .createQueryBuilder('r')
      .innerJoin('r.order', 'o')
      .addSelect(['o.id', 'o.status', 'o.paymentStatus', 'o.total', 'o.exchangeRate', 'o.userId', 'o.shippingAddress'])
      .innerJoin('r.paymentAttempt', 'a')
      .addSelect(['a.id', 'a.transferCode', 'a.amount', 'a.paidAt']);
  }

  async getAdminView(refundId: string) {
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
