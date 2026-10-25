import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EPaymentErrorCode } from '@common/exceptions/error-codes';
import { vndToUsd } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Order } from '../../order/order.entity';
import { CONFIRMABLE_VERIFICATION_STATUSES, PAYMENT_PROVIDER_MANUAL, PAYMENT_PROVIDER_SEPAY } from '../shared/payment.constant';
import { presentAmount } from '../shared/payment.presenter';
import { PaymentAttempt } from '../shared/payment-attempt.entity';
import { applyOrderPaid } from '../shared/payment-paid.util';
import { assertOrderPayable } from '../shared/payment-payable.util';
import { PaymentTransaction } from '../shared/payment-transaction.entity';
import { ConfirmPaymentDto } from './dtos/confirm-payment.dto';

@Injectable()
export class PaymentConfirmService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

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
      const order = await findLocked(manager, Order, { id: orderId });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      assertOrderPayable(order);

      // Giao dịch làm bằng chứng
      let transaction: PaymentTransaction | null = null;
      if (useExisting) {
        transaction = await findLocked(manager, PaymentTransaction, { id: dto.transactionId });
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
        attempt = await findLocked(manager, PaymentAttempt, { id: transaction.paymentAttemptId });
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
        attempt = await findLocked(manager, PaymentAttempt, { orderId: order.id, transferCode });
      } else {
        attempt = await findLocked(manager, PaymentAttempt, { orderId: order.id }, { order: { createdAt: 'DESC' } });
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
}
