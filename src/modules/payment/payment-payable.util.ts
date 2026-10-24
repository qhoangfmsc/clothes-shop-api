import { throwAppError } from '@common/exceptions/app.exception';
import { EPaymentErrorCode } from '@common/exceptions/error-codes';
import { Order } from '../order/order.entity';

/** Đơn còn nhận thanh toán: chưa trả/hoàn và chưa huỷ */
export function assertOrderPayable(order: Pick<Order, 'paymentStatus' | 'status'>) {
  if (order.paymentStatus !== 'unpaid') throwAppError(EPaymentErrorCode.PAYMENT_ORDER_NOT_PAYABLE, 'Order has already been paid');
  if (order.status === 'cancelled') throwAppError(EPaymentErrorCode.PAYMENT_ORDER_NOT_PAYABLE, 'Order has been cancelled');
}
