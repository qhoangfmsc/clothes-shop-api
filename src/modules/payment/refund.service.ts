import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EPaymentErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Order } from '../order/order.entity';
import { markOrderRefunded } from '../order/order-payment-state.util';
import { markReturnRefunded, reopenReturnAfterRefundRejected } from '../return/return-refund-state.util';
import { CompleteRefundDto } from './dtos/complete-refund.dto';
import { CreateRefundDto } from './dtos/create-refund.dto';
import { RejectRefundDto } from './dtos/reject-refund.dto';
import { RefundReason } from './payment.constant';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { Refund } from './refund.entity';
import { RefundQueryService } from './refund-query.service';

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
    private readonly queryService: RefundQueryService,
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

  /** [Admin] Tạo yêu cầu hoàn cho đơn ĐÃ HUỶ mà đã thu tiền (đơn huỷ trước khi có luồng hoàn tiền, hoặc yêu cầu cũ đã bị từ chối) */
  async createAdmin(adminId: string, dto: CreateRefundDto) {
    const refund = await this.dataSource.transaction(async (manager) => {
      const order = await findLocked(manager, Order, { id: dto.orderId });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      if (order.status !== 'cancelled' || order.paymentStatus !== 'paid') {
        throwAppError(
          EPaymentErrorCode.REFUND_NOT_ALLOWED,
          'Only a cancelled order that has been paid and not fully refunded can be refunded',
        );
      }
      return this.createForCancelledOrder(manager, order.id, adminId);
    });
    return { data: await this.queryService.getAdminView(refund.id) };
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
        const order = await findLocked(manager, Order, { id: found.orderId });
        const refund = await findLocked(manager, Refund, { id: refundId });
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
        if (refundedAfter === paid) await markOrderRefunded(manager, order.id);
        if (refund.returnRequestId) await markReturnRefunded(manager, refund.returnRequestId);
      });
    } catch (error) {
      // Hai khoản hoàn (hai đơn khác nhau) cùng được ghi một mã giao dịch ngân hàng cùng lúc: chốt chặn là UNIQUE ở DB
      if ((error as { code?: string })?.code === UNIQUE_VIOLATION) throwAppError(EPaymentErrorCode.REFUND_REFERENCE_DUPLICATE);
      throw error;
    }
    return { data: await this.queryService.getAdminView(refundId) };
  }

  /** [Admin] Không hoàn tiền (có lý do). Đơn giữ nguyên `paid`; đơn đã huỷ thì tạo lại yêu cầu sau này, khoản hoàn của yêu cầu trả hàng thì đưa yêu cầu trả hàng về APPROVED */
  async rejectAdmin(adminId: string, refundId: string, dto: RejectRefundDto) {
    const found = await this.refundRepo.findOne({ where: { id: refundId } });
    if (!found) throwAppError(EPaymentErrorCode.REFUND_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    await this.dataSource.transaction(async (manager) => {
      await findLocked(manager, Order, { id: found.orderId });
      const refund = await findLocked(manager, Refund, { id: refundId });
      if (!refund) throwAppError(EPaymentErrorCode.REFUND_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      if (refund.status !== 'REQUESTED') {
        throwAppError(EPaymentErrorCode.REFUND_NOT_PENDING, `This refund is already ${refund.status}`);
      }
      refund.status = 'REJECTED';
      refund.processedBy = adminId;
      refund.processedAt = new Date();
      refund.note = dto.note;
      await manager.save(refund);
      if (refund.returnRequestId) await reopenReturnAfterRefundRejected(manager, refund.returnRequestId);
    });
    return { data: await this.queryService.getAdminView(refundId) };
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
}
