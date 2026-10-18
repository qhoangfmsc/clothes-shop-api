import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EPaymentErrorCode } from '@common/exceptions/error-codes';
import { money, vndToUsd } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { customAlphabet } from 'nanoid';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { CurrencyService } from '../currency/currency.service';
import { Order } from '../order/order.entity';
import { AdminPaymentAttemptQueryDto } from './dtos/admin-payment-attempt-query.dto';
import { AdminPaymentTransactionQueryDto } from './dtos/admin-payment-transaction-query.dto';
import { ConfirmPaymentDto } from './dtos/confirm-payment.dto';
import { CreateQrPaymentDto } from './dtos/create-qr-payment.dto';
import {
  CONFIRMABLE_VERIFICATION_STATUSES,
  PAYMENT_PROVIDER_MANUAL,
  PAYMENT_PROVIDER_SEPAY,
  PAYMENT_QR_TTL_MS,
  PaymentAttemptStatus,
  TRANSFER_CODE_ALPHABET,
  TRANSFER_CODE_BODY_LENGTH,
  TRANSFER_CODE_MAX_GENERATE_ATTEMPTS,
  VIETQR_IMAGE_URL,
} from './payment.constant';
import { presentAmount, presentOrderTotal } from './payment.presenter';
import { PaymentAttempt } from './payment-attempt.entity';
import { resolveAttemptStatus } from './payment-attempt-status.util';
import { PaymentConfigService, QrConfig } from './payment-config.service';
import { applyTransactionNeedsReviewFilter } from './payment-needs-review.util';
import { applyOrderPaid } from './payment-paid.util';
import { PaymentTransaction } from './payment-transaction.entity';

const generateCodeBody = customAlphabet(TRANSFER_CODE_ALPHABET, TRANSFER_CODE_BODY_LENGTH);

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
export class PaymentService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(PaymentAttempt)
    private readonly attemptRepo: Repository<PaymentAttempt>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    private readonly paymentConfig: PaymentConfigService,
    private readonly currencyService: CurrencyService,
  ) {}

  /** Tạo phiên thanh toán QR cho đơn của user, hoặc trả lại phiên PENDING còn hạn */
  async createQr(userId: string, dto: CreateQrPaymentDto) {
    const config = this.paymentConfig.getQrConfig();

    return this.dataSource.transaction(async (manager) => {
      // Khoá dòng đơn: hai request đồng thời cho cùng đơn phải tuần tự → luôn chỉ có 1 phiên PENDING
      const order = await manager.findOne(Order, { where: { id: dto.orderId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      this.assertPayable(order);

      let attempt = await manager.findOne(PaymentAttempt, { where: { orderId: order.id, status: 'PENDING' } });
      if (attempt && attempt.expiresAt.getTime() <= Date.now()) {
        attempt.status = 'EXPIRED';
        await manager.save(attempt);
        attempt = null;
      }

      if (!attempt) attempt = await this.insertAttempt(manager, order, config, null);

      return { data: this.toQrView(attempt, config, order.exchangeRate) };
    });
  }

  /**
   * [Admin] Tạo mã QR mới cho một đơn bất kỳ (vd khách thanh toán tại cửa hàng). Luôn là mã MỚI: mọi mã đang chờ của đơn hết hạn ngay
   * (`EXPIRED`), nên mỗi đơn chỉ có đúng một mã còn hiệu lực. Tiền chuyển vào mã đã bị thay thế được ghi `LATE` (không tự xác nhận):
   * admin xác nhận thủ công đúng mã đó nếu khách đã chuyển trước khi mã bị thay.
   */
  async createQrAdmin(adminId: string, orderId: string) {
    const config = this.paymentConfig.getQrConfig();

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, { where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      this.assertPayable(order);

      const superseded = await manager.find(PaymentAttempt, { where: { orderId: order.id, status: 'PENDING' } });
      if (superseded.length)
        await manager.update(PaymentAttempt, { orderId: order.id, status: 'PENDING' }, { status: 'EXPIRED', expiresAt: new Date() });

      const attempt = await this.insertAttempt(manager, order, config, adminId);
      return {
        data: { ...this.toQrView(attempt, config, order.exchangeRate), supersededTransferCodes: superseded.map((old) => old.transferCode) },
      };
    });
  }

  /** Đơn còn nhận thanh toán: chưa trả/hoàn và chưa huỷ */
  private assertPayable(order: Order) {
    if (order.paymentStatus !== 'unpaid') throwAppError(EPaymentErrorCode.PAYMENT_ORDER_NOT_PAYABLE, 'Order has already been paid');
    if (order.status === 'cancelled') throwAppError(EPaymentErrorCode.PAYMENT_ORDER_NOT_PAYABLE, 'Order has been cancelled');
  }

  private async insertAttempt(manager: EntityManager, order: Order, config: QrConfig, createdBy: string | null): Promise<PaymentAttempt> {
    return manager.save(
      manager.create(PaymentAttempt, {
        orderId: order.id,
        transferCode: await this.generateUniqueTransferCode(manager, config.prefix),
        amount: this.toPayableAmount(order.total),
        bankAccount: config.account,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + PAYMENT_QR_TTL_MS),
        paidAt: null,
        createdBy,
      }),
    );
  }

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

  /** [Admin] Giao dịch ngân hàng đã nhận (kể cả chưa khớp) để đối soát */
  async findTransactionsAdmin(query: AdminPaymentTransactionQueryDto) {
    const { orderId, verificationStatus, search, needsReview, sort } = query;
    const { page, limit } = getPaging(query);

    // Kèm tóm tắt đơn của phiên khớp (chỉ vài cột) để màn đối soát không phải gọi thêm API
    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.paymentAttempt', 'a')
      .leftJoin('a.order', 'o')
      .addSelect(['o.id', 'o.status', 'o.paymentStatus', 'o.total', 'o.exchangeRate', 'o.userId']);

    if (orderId) qb.andWhere('a.order_id = :orderId', { orderId });
    // Chỉ giao dịch cần admin xử lý (cùng điều kiện với con số trên menu admin)
    if (needsReview) applyTransactionNeedsReviewFilter(qb);
    if (verificationStatus) qb.andWhere('t.verification_status = :verificationStatus', { verificationStatus });
    if (search) {
      qb.andWhere('(t.transfer_content ILIKE :search OR t.provider_transaction_id ILIKE :search OR a.transfer_code ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-receivedAt');
    qb.orderBy(`t.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const currentRate = await this.currencyService.getVndPerUsd();

    // USD theo tỷ giá của đơn khớp; giao dịch chưa khớp đơn nào thì theo tỷ giá hiện tại
    const presented = data.map((transaction) => {
      const attempt = transaction.paymentAttempt;
      const rate = attempt?.order?.exchangeRate ?? currentRate;
      return {
        ...presentAmount(transaction, rate),
        paymentAttempt: attempt
          ? {
              ...presentAmount(attempt, rate),
              order: attempt.order ? presentOrderTotal(attempt.order, rate) : attempt.order,
            }
          : attempt,
      };
    });
    return paginated(presented, total, page, limit);
  }

  /** Số giao dịch cần admin xử lý — cùng điều kiện với bộ lọc `needsReview` của `findTransactionsAdmin` */
  async countNeedsReview(): Promise<number> {
    const qb = this.transactionRepo.createQueryBuilder('t').leftJoin('t.paymentAttempt', 'a').leftJoin('a.order', 'o');
    return applyTransactionNeedsReviewFilter(qb).getCount();
  }

  /**
   * Đánh dấu `EXPIRED` các phiên `PENDING` đã quá hạn (không đụng phiên của đơn đã huỷ — phiên đó thuộc về `CANCELLED`).
   * Trả số phiên đã đổi. Idempotent; được gọi bởi bộ đếm giờ mỗi phút và khi admin tra cứu.
   */
  async expireOverdueAttempts(): Promise<number> {
    const result = await this.dataSource.query(
      `UPDATE "payment_attempts" SET "status" = 'EXPIRED', "updated_at" = now()
       WHERE "status" = 'PENDING' AND "expires_at" <= now()
         AND "order_id" NOT IN (SELECT "id" FROM "orders" WHERE "status" = 'cancelled')`,
    );
    // Driver postgres trả [rows, rowCount] cho UPDATE
    return Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
  }

  /** Đơn bị huỷ (khách hoặc admin): các mã chuyển khoản còn chờ của đơn không còn hiệu lực → `CANCELLED` */
  async cancelPendingAttempts(orderId: string, manager?: EntityManager): Promise<void> {
    // Có `manager` thì chạy trong transaction của nơi gọi (huỷ đơn + huỷ mã + tạo yêu cầu hoàn là một khối)
    if (manager) await manager.update(PaymentAttempt, { orderId, status: 'PENDING' }, { status: 'CANCELLED' });
    else await this.attemptRepo.update({ orderId, status: 'PENDING' }, { status: 'CANCELLED' });
  }

  /**
   * [Admin] Tra cứu mọi nội dung chuyển khoản đã cấp (kể cả đã hết hạn) theo mã, đơn hoặc khách: gõ đúng nội dung trên sao kê
   * (vd DHG29JR5A8) là thấy mã thuộc đơn nào, của khách nào, đã hết hạn chưa và giao dịch nào đã gắn vào.
   */
  async findAttemptsAdmin(query: AdminPaymentAttemptQueryDto) {
    const { orderId, status, search, sort } = query;
    const { page, limit } = getPaging(query);

    // Bộ đếm giờ nền đã làm việc này mỗi phút; chạy thêm ở đây để kết quả tra cứu đúng ngay cả khi instance vừa thức dậy
    await this.expireOverdueAttempts();

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

  /** [Admin] Toàn cảnh thanh toán của một đơn: tóm tắt đơn + các phiên QR + các giao dịch ngân hàng đã gắn vào phiên (để điều tra) */
  async getOrderPaymentsAdmin(orderId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    const attempts = await this.attemptRepo.find({ where: { orderId }, order: { createdAt: 'DESC' } });
    const transactions = attempts.length
      ? await this.transactionRepo.find({
          where: { paymentAttemptId: In(attempts.map((attempt) => attempt.id)) },
          order: { receivedAt: 'DESC' },
        })
      : [];

    return {
      data: {
        order: {
          id: order.id,
          userId: order.userId,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paidAt: order.paidAt,
          ...money('subtotal', order.subtotal, order.exchangeRate),
          ...money('shippingFee', order.shippingFee, order.exchangeRate),
          ...money('total', order.total, order.exchangeRate),
          exchangeRate: order.exchangeRate,
          shippingMethod: order.shippingMethod,
          customer: { fullName: order.shippingAddress?.fullName ?? null, phone: order.shippingAddress?.phone ?? null },
          createdAt: order.createdAt,
        },
        // `status` là trạng thái hiệu lực (PENDING quá hạn → EXPIRED; đơn đã huỷ → CANCELLED), giống khách và API status thấy
        attempts: attempts.map((attempt) => ({
          ...presentAmount(attempt, order.exchangeRate),
          status: resolveAttemptStatus(attempt, order.status),
        })),
        transactions: transactions.map((transaction) => presentAmount(transaction, order.exchangeRate)),
      },
    };
  }

  /**
   * [Admin] Xác nhận thủ công đơn đã thanh toán (webhook SePay không tới/lỗi nhưng tiền đã về).
   * Luôn gắn một giao dịch làm bằng chứng: giao dịch có sẵn (`transactionId`) hoặc giao dịch mới (`reference` + `amountVnd`).
   * Cùng cơ chế khoá và cập nhật với webhook (order → transaction → attempt), nên không thể trả hai lần.
   */
  async confirmPaymentAdmin(adminId: string, orderId: string, dto: ConfirmPaymentDto) {
    const transferCode = dto.transferCode?.trim().toUpperCase();
    const useExisting = dto.transactionId !== undefined;
    const hasNewFields = dto.reference !== undefined || dto.amountVnd !== undefined;
    // transactionId: không kèm reference/amountVnd. Cách còn lại: bắt buộc amountVnd và ít nhất một trong reference / transferCode
    const invalid = useExisting ? hasNewFields : dto.amountVnd === undefined || (dto.reference === undefined && transferCode === undefined);
    // Không có mã giao dịch ngân hàng thì mã giao dịch được ghi chính là nội dung chuyển khoản (nguồn manual)
    const provider = dto.provider ?? (dto.reference !== undefined ? PAYMENT_PROVIDER_SEPAY : PAYMENT_PROVIDER_MANUAL);
    if (invalid || (!useExisting && dto.reference === undefined && provider !== PAYMENT_PROVIDER_MANUAL)) {
      throwAppError(EPaymentErrorCode.PAYMENT_CONFIRM_INPUT_INVALID);
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, { where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      if (order.paymentStatus !== 'unpaid') throwAppError(EPaymentErrorCode.PAYMENT_ORDER_NOT_PAYABLE, 'Order has already been paid');
      if (order.status === 'cancelled') throwAppError(EPaymentErrorCode.PAYMENT_ORDER_NOT_PAYABLE, 'Order has been cancelled');

      // Giao dịch làm bằng chứng
      let transaction: PaymentTransaction | null = null;
      if (useExisting) {
        transaction = await manager.findOne(PaymentTransaction, { where: { id: dto.transactionId }, lock: { mode: 'pessimistic_write' } });
        if (!transaction) throwAppError(EPaymentErrorCode.PAYMENT_TRANSACTION_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
        if (!CONFIRMABLE_VERIFICATION_STATUSES.includes(transaction.verificationStatus)) {
          throwAppError(
            EPaymentErrorCode.PAYMENT_TRANSACTION_NOT_CONFIRMABLE,
            `Transaction with status ${transaction.verificationStatus} cannot be used to confirm a payment`,
          );
        }
      }
      // Mã giao dịch lưu nguyên văn; nguồn (sepay/manual) nằm ở cột `provider`, UNIQUE theo cặp
      const providerTransactionId = (dto.reference ?? transferCode) as string;
      if (!transaction && (await manager.exists(PaymentTransaction, { where: { provider, providerTransactionId } }))) {
        throwAppError(
          EPaymentErrorCode.PAYMENT_TRANSACTION_NOT_CONFIRMABLE,
          'A transaction with this reference is already recorded — confirm it with its transactionId',
        );
      }

      // Phiên được đánh dấu đã trả: phiên mà giao dịch đã gắn, hoặc phiên mang `transferCode` admin chỉ định (kể cả đã hết hạn),
      // không thì phiên mới nhất của đơn. Phiên luôn phải thuộc đúng đơn này.
      let attempt: PaymentAttempt | null = null;
      if (transaction?.paymentAttemptId) {
        attempt = await manager.findOne(PaymentAttempt, {
          where: { id: transaction.paymentAttemptId },
          lock: { mode: 'pessimistic_write' },
        });
        if (attempt && attempt.orderId !== order.id) {
          throwAppError(
            EPaymentErrorCode.PAYMENT_TRANSACTION_NOT_CONFIRMABLE,
            'This transaction belongs to the payment session of another order',
          );
        }
        if (attempt && transferCode !== undefined && attempt.transferCode !== transferCode) {
          throwAppError(
            EPaymentErrorCode.PAYMENT_TRANSACTION_NOT_CONFIRMABLE,
            'transferCode does not match the payment session of this transaction',
          );
        }
      } else if (transferCode !== undefined) {
        attempt = await manager.findOne(PaymentAttempt, {
          where: { orderId: order.id, transferCode },
          lock: { mode: 'pessimistic_write' },
        });
      } else {
        attempt = await manager.findOne(PaymentAttempt, {
          where: { orderId: order.id },
          order: { createdAt: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
      }
      if (!attempt) {
        throwAppError(
          EPaymentErrorCode.PAYMENT_ATTEMPT_NOT_FOUND,
          transferCode ? `No payment session with transfer code ${transferCode} for this order` : undefined,
          HttpStatus.NOT_FOUND,
        );
      }

      const received = transaction ? transaction.amount : (dto.amountVnd as number);
      if (received !== attempt.amount && dto.acceptAmountMismatch !== true) {
        throwAppError(
          EPaymentErrorCode.PAYMENT_AMOUNT_MISMATCH,
          `Received ${received} VND (${vndToUsd(received, order.exchangeRate)} USD) but the payment session expects ${attempt.amount} VND (${vndToUsd(attempt.amount, order.exchangeRate)} USD). Send acceptAmountMismatch=true to confirm anyway`,
        );
      }

      const now = new Date();
      attempt.status = 'PAID';
      attempt.paidAt = now;
      await manager.save(attempt);
      await applyOrderPaid(manager, order.id, now);

      const evidence = {
        paymentAttemptId: attempt.id,
        verificationStatus: 'MANUALLY_CONFIRMED' as const,
        confirmedBy: adminId,
        confirmedAt: now,
        confirmNote: dto.note,
      };
      const saved = transaction
        ? await manager.save(Object.assign(transaction, evidence))
        : await manager.save(
            manager.create(PaymentTransaction, {
              ...evidence,
              providerTransactionId,
              provider,
              amount: received,
              // Nội dung chuyển khoản thật nếu admin nhập từ sao kê, không thì mã đã cấp cho khách; lý do nằm ở confirm_note
              transferContent: dto.transferContent ?? attempt.transferCode,
              rawPayload: {
                source: 'manual-confirmation',
                reference: providerTransactionId,
                provider,
                transferCode: attempt.transferCode,
                confirmedBy: adminId,
              },
              receivedAt: now,
            }),
          );

      return {
        data: {
          orderId: order.id,
          paymentStatus: 'paid',
          paidAt: now,
          attemptId: attempt.id,
          transaction: presentAmount(saved, order.exchangeRate),
        },
      };
    });
  }

  /** `orders.total` (VND) chính là số tiền khách phải chuyển; phải là số nguyên dương nằm trong vùng an toàn của number */
  private toPayableAmount(total: number | string): number {
    const amount = Number(total);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throwAppError(EPaymentErrorCode.PAYMENT_ORDER_NOT_PAYABLE, 'Order total is not a payable VND amount');
    }
    return amount;
  }

  private async generateUniqueTransferCode(manager: EntityManager, prefix: string): Promise<string> {
    for (let i = 0; i < TRANSFER_CODE_MAX_GENERATE_ATTEMPTS; i++) {
      const code = `${prefix}${generateCodeBody()}`;
      // Mã đã dùng (kể cả phiên cũ) không bao giờ được cấp lại; UNIQUE ở DB là chốt chặn cuối
      if (!(await manager.exists(PaymentAttempt, { where: { transferCode: code } }))) return code;
    }
    return throwAppError(EPaymentErrorCode.PAYMENT_CODE_GENERATION_FAILED, undefined, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private toQrView(attempt: PaymentAttempt, config: QrConfig, vndPerUsd: number) {
    const params = new URLSearchParams({
      acc: attempt.bankAccount,
      bank: config.bankCode,
      amount: String(attempt.amount),
      des: attempt.transferCode,
    });
    return {
      orderId: attempt.orderId,
      paymentId: attempt.id,
      qrUrl: `${VIETQR_IMAGE_URL}?${params.toString()}`,
      ...money('amount', attempt.amount, vndPerUsd),
      exchangeRate: vndPerUsd,
      bankName: config.bankName,
      accountNumber: attempt.bankAccount,
      accountName: config.accountName,
      transferContent: attempt.transferCode,
      status: attempt.status,
      expiresAt: attempt.expiresAt,
    };
  }
}
