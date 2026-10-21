import { createHmac } from 'node:crypto';
import { TEST_ENV } from './test-env';

export interface SepayTransfer {
  /** Mã giao dịch phía SePay: duy nhất, dùng để kiểm tra idempotency */
  id: string | number;
  amount: number;
  /** Nội dung chuyển khoản, chứa mã `DH...` của phiên QR */
  content: string;
  accountNumber?: string;
  transferType?: 'in' | 'out';
}

/** Webhook SePay đã ký HMAC đúng thuật toán của `sepay-signature.util` (body gửi nguyên văn để rawBody khớp chữ ký) */
export function sepayWebhook(transfer: SepayTransfer, options: { secret?: string; timestamp?: number } = {}) {
  const body = JSON.stringify({
    id: transfer.id,
    transferType: transfer.transferType ?? 'in',
    transferAmount: transfer.amount,
    accountNumber: transfer.accountNumber ?? TEST_ENV.SEPAY_RECEIVING_ACCOUNT,
    code: null,
    content: transfer.content,
  });
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac('sha256', options.secret ?? TEST_ENV.SEPAY_WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex')}`;

  return {
    body,
    headers: { 'Content-Type': 'application/json', 'X-SePay-Signature': signature, 'X-SePay-Timestamp': timestamp },
  };
}
