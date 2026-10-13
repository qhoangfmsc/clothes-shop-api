import { createHmac, timingSafeEqual } from 'node:crypto';
import { SEPAY_SIGNATURE_TOLERANCE_SECONDS } from './payment.constant';

export interface VerifySepaySignatureInput {
  secret: string;
  /** Bytes gốc của body — KHÔNG phải JSON đã parse/serialize lại */
  rawBody: Buffer;
  signatureHeader?: string | string[];
  timestampHeader?: string | string[];
  /** Mili-giây hiện tại (tiêm vào để test) */
  nowMs?: number;
}

const firstHeader = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

/**
 * Xác thực chữ ký webhook SePay (HMAC-SHA256):
 *   X-SePay-Signature = "sha256=" + hex(HMAC(secret, `${X-SePay-Timestamp}.${rawBody}`))
 * và X-SePay-Timestamp (giây) phải lệch ≤ 300 giây so với giờ server.
 */
export function verifySepaySignature(input: VerifySepaySignatureInput): boolean {
  const signature = firstHeader(input.signatureHeader);
  const timestamp = firstHeader(input.timestampHeader);
  if (!input.secret || !signature || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;

  const nowSeconds = (input.nowMs ?? Date.now()) / 1000;
  if (Math.abs(nowSeconds - Number(timestamp)) > SEPAY_SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(
    `sha256=${createHmac('sha256', input.secret)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), input.rawBody]))
      .digest('hex')}`,
  );
  const received = Buffer.from(signature);
  // timingSafeEqual ném lỗi nếu độ dài khác nhau
  return received.length === expected.length && timingSafeEqual(received, expected);
}
