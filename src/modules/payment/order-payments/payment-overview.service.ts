import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode } from '@common/exceptions/error-codes';
import { money } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order } from '../../order/order.entity';
import { resolveAttemptStatus } from '../attempt/payment-attempt-status.util';
import { presentAmount } from '../shared/payment.presenter';
import { PaymentAttempt } from '../shared/payment-attempt.entity';
import { PaymentTransaction } from '../shared/payment-transaction.entity';

@Injectable()
export class PaymentOverviewService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(PaymentAttempt)
    private readonly attemptRepo: Repository<PaymentAttempt>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
  ) {}

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
}
