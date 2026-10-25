import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EPaymentErrorCode } from '@common/exceptions/error-codes';
import { money } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order } from '../../order/order.entity';
import { PaymentAttemptStatus } from '../shared/payment.constant';
import { PaymentAttempt } from '../shared/payment-attempt.entity';
import { PaymentTransaction } from '../shared/payment-transaction.entity';
import { AdminPaymentAttemptQueryDto } from './dtos/admin-payment-attempt-query.dto';
import { PaymentAttemptService } from './payment-attempt.service';
import { resolveAttemptStatus } from './payment-attempt-status.util';

/** Trạng thái hiệu lực của phiên trong SQL (cùng quy tắc với `resolveAttemptStatus`): alias `a` = payment_attempts, `o` = orders */
const EFFECTIVE_ATTEMPT_STATUS_SQL = `(CASE WHEN a.status <> 'PENDING' THEN a.status WHEN o.status = 'cancelled' THEN 'CANCELLED' WHEN a.expires_at <= now() THEN 'EXPIRED' ELSE 'PENDING' END)`;

/** Phiên thanh toán như khách được xem (không lộ tài khoản nhận, raw payload, id nội bộ) */
export interface CustomerPaymentAttempt {
  transferCode: string;
  /** Số tiền phải chuyển (VND) và giá trị USD tương ứng theo tỷ giá của đơn */
  amountVnd: number;
  amountUsd: number;
  status: PaymentAttemptStatus;
  createdAt: Date;
  expiresAt: Date;
  paidAt: Date | null;
  /** Mã giao dịch ngân hàng/SePay của giao dịch đã khớp; null nếu phiên chưa PAID */
  transactionRef: string | null;
}

@Injectable()
export class PaymentAttemptQueryService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(PaymentAttempt)
    private readonly attemptRepo: Repository<PaymentAttempt>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    private readonly paymentService: PaymentAttemptService,
  ) {}

  /** Trạng thái thanh toán của đơn — chỉ đọc DB, không gọi SePay */
  async getStatus(userId: string, orderId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, userId } });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    // Số tiền của đơn (VND + USD theo tỷ giá chốt trên đơn) để trang thanh toán vẫn hiển thị khi đang hỏi trạng thái
    const amount = { ...money('amount', order.total, order.exchangeRate), exchangeRate: order.exchangeRate };
    if (order.paymentStatus !== 'unpaid') return { data: { orderId, status: 'PAID' as PaymentAttemptStatus, ...amount } };

    const attempt = await this.attemptRepo.findOne({ where: { orderId }, order: { createdAt: 'DESC' } });
    if (!attempt) throwAppError(EPaymentErrorCode.PAYMENT_ATTEMPT_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    return { data: { orderId, status: resolveAttemptStatus(attempt, order.status), ...amount } };
  }

  /**
   * Các nội dung chuyển khoản đã cấp cho một đơn (kể cả mã hết hạn), mới nhất trước — để khách xem lại và đọc cho cửa hàng.
   * Chỉ gồm các field an toàn cho khách; không có tài khoản nhận, raw payload hay id nội bộ.
   * Quyền sở hữu đơn do nơi gọi kiểm tra.
   */
  async listAttemptsForCustomer(order: { id: string; status: string; exchangeRate: number }): Promise<CustomerPaymentAttempt[]> {
    const attempts = await this.attemptRepo.find({ where: { orderId: order.id }, order: { createdAt: 'DESC' } });
    if (!attempts.length) return [];

    // Mã giao dịch ngân hàng chỉ của giao dịch đã khớp phiên PAID (không lấy giao dịch trùng/sai tiền cùng gắn vào phiên)
    const paidIds = attempts.filter((attempt) => attempt.status === 'PAID').map((attempt) => attempt.id);
    const matched = paidIds.length
      ? await this.transactionRepo.find({
          where: { paymentAttemptId: In(paidIds), verificationStatus: In(['MATCHED', 'MANUALLY_CONFIRMED']) },
        })
      : [];
    const refByAttempt = new Map(matched.map((tx) => [tx.paymentAttemptId, tx.providerTransactionId]));

    return attempts.map((attempt) => ({
      transferCode: attempt.transferCode,
      ...money('amount', attempt.amount, order.exchangeRate),
      status: resolveAttemptStatus(attempt, order.status),
      createdAt: attempt.createdAt,
      expiresAt: attempt.expiresAt,
      paidAt: attempt.paidAt,
      transactionRef: attempt.status === 'PAID' ? (refByAttempt.get(attempt.id) ?? null) : null,
    }));
  }

  /**
   * [Admin] Tra cứu mọi nội dung chuyển khoản đã cấp (kể cả đã hết hạn) theo mã, đơn hoặc khách: gõ đúng nội dung trên sao kê
   * (vd DHG29JR5A8) là thấy mã thuộc đơn nào, của khách nào, đã hết hạn chưa và giao dịch nào đã gắn vào.
   */
  async findAttemptsAdmin(query: AdminPaymentAttemptQueryDto) {
    const { orderId, status, search, sort } = query;
    const { page, limit } = getPaging(query);

    // Bộ đếm giờ nền đã làm việc này mỗi phút; chạy thêm ở đây để kết quả tra cứu đúng ngay cả khi instance vừa thức dậy
    await this.paymentService.expireOverdueAttempts();

    // Chỉ lấy các cột đơn được trả ra (không kéo cả bản ghi đơn)
    const qb = this.attemptRepo
      .createQueryBuilder('a')
      .innerJoin('a.order', 'o')
      .addSelect(['o.id', 'o.status', 'o.paymentStatus', 'o.total', 'o.exchangeRate', 'o.userId', 'o.shippingAddress']);

    if (orderId) qb.andWhere('a.order_id = :orderId', { orderId });
    if (status) qb.andWhere(`${EFFECTIVE_ATTEMPT_STATUS_SQL} = :status`, { status });
    if (search) {
      qb.andWhere(
        "(a.transfer_code ILIKE :search OR a.order_id ILIKE :search OR o.shipping_address->>'phone' ILIKE :search OR o.shipping_address->>'fullName' ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`a.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [attempts, total] = await qb.getManyAndCount();

    // Giao dịch ngân hàng đã gắn vào các phiên này (nếu có)
    const transactions = attempts.length
      ? await this.transactionRepo.find({
          where: { paymentAttemptId: In(attempts.map((attempt) => attempt.id)) },
          order: { receivedAt: 'DESC' },
        })
      : [];

    const data = attempts.map((attempt) => ({
      id: attempt.id,
      transferCode: attempt.transferCode,
      ...money('amount', attempt.amount, attempt.order.exchangeRate),
      status: resolveAttemptStatus(attempt, attempt.order.status),
      createdAt: attempt.createdAt,
      expiresAt: attempt.expiresAt,
      paidAt: attempt.paidAt,
      createdBy: attempt.createdBy,
      order: {
        id: attempt.order.id,
        status: attempt.order.status,
        paymentStatus: attempt.order.paymentStatus,
        ...money('total', attempt.order.total, attempt.order.exchangeRate),
        exchangeRate: attempt.order.exchangeRate,
        userId: attempt.order.userId,
        customer: { fullName: attempt.order.shippingAddress?.fullName ?? null, phone: attempt.order.shippingAddress?.phone ?? null },
      },
      transactions: transactions
        .filter((tx) => tx.paymentAttemptId === attempt.id)
        .map((tx) => ({
          id: tx.id,
          provider: tx.provider,
          providerTransactionId: tx.providerTransactionId,
          ...money('amount', tx.amount, attempt.order.exchangeRate),
          verificationStatus: tx.verificationStatus,
          transferContent: tx.transferContent,
          receivedAt: tx.receivedAt,
        })),
    }));

    return paginated(data, total, page, limit);
  }
}
