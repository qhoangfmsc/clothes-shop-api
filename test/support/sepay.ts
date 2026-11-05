import { createHmac } from 'node:crypto';
import { TEST_ENV } from './test-env';

export interface SepayTransfer {
  id: string | number;
  amount: number;
  content: string;
  accountNumber?: string;
  transferType?: 'in' | 'out';
}

/** Ký một body bất kỳ đúng thuật toán của SePay (dùng khi cần body sai cấu trúc nhưng chữ ký đúng). */
export function signSepayBody(body: string, options: { secret?: string; timestamp?: number } = {}) {
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac('sha256', options.secret ?? TEST_ENV.SEPAY_WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex')}`;
  return { 'Content-Type': 'application/json', 'X-SePay-Signature': signature, 'X-SePay-Timestamp': timestamp };
}

/** Webhook SePay ký HMAC; body gửi nguyên văn để khớp chữ ký. */
export function sepayWebhook(transfer: SepayTransfer, options: { secret?: string; timestamp?: number } = {}) {
  const body = JSON.stringify({
    id: transfer.id,
    transferType: transfer.transferType ?? 'in',
    transferAmount: transfer.amount,
    accountNumber: transfer.accountNumber ?? TEST_ENV.SEPAY_RECEIVING_ACCOUNT,
    code: null,
    content: transfer.content,
  });
  return { body, headers: signSepayBody(body, options) };
}
