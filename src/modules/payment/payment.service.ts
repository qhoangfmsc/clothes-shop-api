import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EPaymentErrorCode } from '@common/exceptions/error-codes';
import { money } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { customAlphabet } from 'nanoid';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Order } from '../order/order.entity';
import { CreateQrPaymentDto } from './dtos/create-qr-payment.dto';
import {
  PAYMENT_QR_TTL_MS,
  TRANSFER_CODE_ALPHABET,
  TRANSFER_CODE_BODY_LENGTH,
  TRANSFER_CODE_MAX_GENERATE_ATTEMPTS,
  VIETQR_IMAGE_URL,
} from './payment.constant';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentConfigService, QrConfig } from './payment-config.service';
import { assertOrderPayable } from './payment-payable.util';

const generateCodeBody = customAlphabet(TRANSFER_CODE_ALPHABET, TRANSFER_CODE_BODY_LENGTH);

@Injectable()
export class PaymentService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(PaymentAttempt)
    private readonly attemptRepo: Repository<PaymentAttempt>,
    private readonly paymentConfig: PaymentConfigService,
  ) {}

  /** Tạo phiên thanh toán QR cho đơn của user, hoặc trả lại phiên PENDING còn hạn */
  async createQr(userId: string, dto: CreateQrPaymentDto) {
    const config = this.paymentConfig.getQrConfig();

    return this.dataSource.transaction(async (manager) => {
      // Khoá dòng đơn: hai request đồng thời cho cùng đơn phải tuần tự → luôn chỉ có 1 phiên PENDING
      const order = await findLocked(manager, Order, { id: dto.orderId, userId });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      assertOrderPayable(order);

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
      const order = await findLocked(manager, Order, { id: orderId });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      assertOrderPayable(order);

      const superseded = await manager.find(PaymentAttempt, { where: { orderId: order.id, status: 'PENDING' } });
      if (superseded.length)
        await manager.update(PaymentAttempt, { orderId: order.id, status: 'PENDING' }, { status: 'EXPIRED', expiresAt: new Date() });

      const attempt = await this.insertAttempt(manager, order, config, adminId);
      return {
        data: { ...this.toQrView(attempt, config, order.exchangeRate), supersededTransferCodes: superseded.map((old) => old.transferCode) },
      };
    });
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

  /** Đơn bị huỷ (khách hoặc admin): các mã chuyển khoản còn chờ của đơn không còn hiệu lực → `CANCELLED` */
  async cancelPendingAttempts(orderId: string, manager?: EntityManager): Promise<void> {
    // Có `manager` thì chạy trong transaction của nơi gọi (huỷ đơn + huỷ mã + tạo yêu cầu hoàn là một khối)
    if (manager) await manager.update(PaymentAttempt, { orderId, status: 'PENDING' }, { status: 'CANCELLED' });
    else await this.attemptRepo.update({ orderId, status: 'PENDING' }, { status: 'CANCELLED' });
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
