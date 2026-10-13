import { throwAppError } from '@common/exceptions/app.exception';
import { EPaymentErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Order } from '../order/order.entity';
import { PAYMENT_PROVIDER_SEPAY, PaymentVerificationStatus } from './payment.constant';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentConfigService, WebhookConfig } from './payment-config.service';
import { applyOrderPaid } from './payment-paid.util';
import { PaymentTransaction } from './payment-transaction.entity';
import { extractTransferCodes, normalizeAccountNumber, parseSepayPayload, SepayWebhookPayload } from './sepay-payload.util';
import { verifySepaySignature } from './sepay-signature.util';

export interface SepayWebhookInput {
  rawBody?: Buffer;
  signature?: string | string[];
  timestamp?: string | string[];
}

type Outcome = PaymentVerificationStatus | 'DUPLICATE';

const MAX_CONTENT_LENGTH = 500;
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class SepayWebhookService {
  private readonly logger = new Logger(SepayWebhookService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly paymentConfig: PaymentConfigService,
  ) {}

  /**
   * Xử lý webhook SePay. Thứ tự bắt buộc: xác thực chữ ký trên raw body → parse → đối chiếu trong 1 transaction.
   * Chỉ trả `{ success: true }` khi giao dịch đã được lưu (kể cả khi không khớp đơn — để SePay không gửi lại);
   * lỗi hệ thống ném ra để SePay retry (idempotent nhờ `provider_transaction_id` UNIQUE).
   */
  async handle(input: SepayWebhookInput) {
    const config = this.paymentConfig.getWebhookConfig();

    if (
      !input.rawBody ||
      !verifySepaySignature({
        secret: config.secret,
        rawBody: input.rawBody,
        signatureHeader: input.signature,
        timestampHeader: input.timestamp,
      })
    ) {
      // Không log body/header: chỉ ghi nhận có request bị từ chối
      this.logger.warn('Rejected SePay webhook: invalid signature');
      throwAppError(EPaymentErrorCode.PAYMENT_INVALID_SIGNATURE, undefined, HttpStatus.UNAUTHORIZED);
    }

    const payload = parseSepayPayload(input.rawBody);

    let outcome: Outcome;
    try {
      outcome = await this.dataSource.transaction((manager) => this.process(manager, payload, config));
    } catch (error) {
      if ((error as { code?: string })?.code === UNIQUE_VIOLATION) {
        // Hai webhook cùng id chạy song song: bên thua bị rollback hoàn toàn, bên thắng đã lưu
        outcome = 'DUPLICATE';
      } else {
        this.logger.error(`SePay webhook processing failed (transaction ${payload.id}): ${(error as Error)?.message}`);
        throw error;
      }
    }

    if (outcome === 'DUPLICATE') this.logger.log(`SePay transaction ${payload.id} already processed`);
    else if (outcome === 'MATCHED') this.logger.log(`SePay transaction ${payload.id} matched and order marked paid`);
    else this.logger.warn(`SePay transaction ${payload.id} recorded for reconciliation: ${outcome}`);

    return { success: true };
  }

  private async process(manager: EntityManager, payload: SepayWebhookPayload, config: WebhookConfig): Promise<Outcome> {
    const existing = await manager.findOne(PaymentTransaction, {
      where: { provider: PAYMENT_PROVIDER_SEPAY, providerTransactionId: payload.id },
    });
    if (existing) return 'DUPLICATE';

    // Lưu giao dịch trước (UNIQUE chặn trùng); đối chiếu xong mới cập nhật trạng thái
    const transaction = await manager.save(
      manager.create(PaymentTransaction, {
        paymentAttemptId: null,
        providerTransactionId: payload.id,
        provider: PAYMENT_PROVIDER_SEPAY,
        amount: payload.transferAmount,
        transferContent: payload.content.slice(0, MAX_CONTENT_LENGTH),
        rawPayload: payload.raw,
        receivedAt: new Date(),
        verificationStatus: 'UNMATCHED',
      }),
    );

    const { status, attemptId } = await this.reconcile(manager, payload, config);
    transaction.verificationStatus = status;
    transaction.paymentAttemptId = attemptId;
    await manager.save(transaction);

    return status;
  }

  private async reconcile(
    manager: EntityManager,
    payload: SepayWebhookPayload,
    config: WebhookConfig,
  ): Promise<{ status: PaymentVerificationStatus; attemptId: string | null }> {
    if (payload.transferType !== 'in') return { status: 'IGNORED', attemptId: null };
    if (normalizeAccountNumber(payload.accountNumber) !== normalizeAccountNumber(config.account)) {
      return { status: 'ACCOUNT_MISMATCH', attemptId: null };
    }

    const codes = extractTransferCodes(config.prefix, payload.code, payload.content);
    if (!codes.length) return { status: 'UNMATCHED', attemptId: null };
    // Mã chuyển khoản duy nhất cho từng phiên (kể cả phiên đã hết hạn) nên chỉ trỏ tới đúng một phiên
    const found = await manager.findOne(PaymentAttempt, { where: { transferCode: In(codes) } });
    if (!found) return { status: 'UNMATCHED', attemptId: null };

    // Thứ tự khoá: order → attempt (giống createQr) để không deadlock
    const order = await manager.findOne(Order, { where: { id: found.orderId }, lock: { mode: 'pessimistic_write' } });
    const attempt = await manager.findOne(PaymentAttempt, { where: { id: found.id }, lock: { mode: 'pessimistic_write' } });
    if (!order || !attempt) return { status: 'UNMATCHED', attemptId: null };

    const result = (status: PaymentVerificationStatus) => ({ status, attemptId: attempt.id });

    if (normalizeAccountNumber(attempt.bankAccount) !== normalizeAccountNumber(payload.accountNumber)) {
      return result('ACCOUNT_MISMATCH');
    }
    // Tiền đến lần 2 cho phiên/đơn đã trả → ghi nhận để hoàn tiền thủ công, không đổi gì
    if (attempt.status === 'PAID' || order.paymentStatus === 'paid') return result('DUPLICATE_PAYMENT');
    if (order.status === 'cancelled' || attempt.status === 'CANCELLED') return result('NOT_PAYABLE');
    if (payload.transferAmount !== attempt.amount) return result('AMOUNT_MISMATCH');

    const now = new Date();
    if (attempt.status === 'EXPIRED' || attempt.expiresAt.getTime() <= now.getTime()) {
      // Tiền đã về nhưng QR hết hạn: không tự xác nhận, giữ lại để đối soát
      if (attempt.status === 'PENDING') {
        attempt.status = 'EXPIRED';
        await manager.save(attempt);
      }
      return result('LATE');
    }

    attempt.status = 'PAID';
    attempt.paidAt = now;
    await manager.save(attempt);
    // Đơn → paid (+ pending → confirmed), huỷ các phiên PENDING khác; dùng chung với xác nhận thủ công
    await applyOrderPaid(manager, order.id, now);
    return result('MATCHED');
  }
}
