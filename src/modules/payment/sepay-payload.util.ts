import { throwAppError } from '@common/exceptions/app.exception';
import { EPaymentErrorCode } from '@common/exceptions/error-codes';
import { TRANSFER_CODE_BODY_LENGTH } from './payment.constant';

/** Phần payload webhook SePay mà backend dùng (các field còn lại vẫn được lưu trong `raw_payload`) */
export interface SepayWebhookPayload {
  id: string;
  transferType: string;
  transferAmount: number;
  accountNumber: string;
  code: string | null;
  content: string;
  raw: Record<string, unknown>;
}

const invalid = (reason: string): never =>
  throwAppError(EPaymentErrorCode.PAYMENT_INVALID_PAYLOAD, `Invalid SePay webhook payload: ${reason}`);

/** Parse body gốc (đã qua xác thực chữ ký) và kiểm tra các field bắt buộc. Không dùng DTO vì SePay có thể thêm field mới. */
export function parseSepayPayload(rawBody: Buffer): SepayWebhookPayload {
  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return invalid('body is not valid JSON');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return invalid('body must be a JSON object');
  const body = json as Record<string, unknown>;

  const id = typeof body.id === 'number' || typeof body.id === 'string' ? String(body.id).trim() : '';
  if (!id || id.length > 64) return invalid('id');
  if (typeof body.transferType !== 'string') return invalid('transferType');
  if (typeof body.transferAmount !== 'number' || !Number.isSafeInteger(body.transferAmount) || body.transferAmount < 0) {
    return invalid('transferAmount');
  }
  if (typeof body.accountNumber !== 'string' || !body.accountNumber.trim()) return invalid('accountNumber');

  return {
    id,
    transferType: body.transferType.toLowerCase(),
    transferAmount: body.transferAmount,
    accountNumber: body.accountNumber,
    code: typeof body.code === 'string' ? body.code : null,
    content: typeof body.content === 'string' ? body.content : '',
    raw: body,
  };
}

/** Bỏ khoảng trắng/dấu gạch để so sánh số tài khoản */
export const normalizeAccountNumber = (value: string) => value.replace(/[\s-]/g, '');

/**
 * Các mã chuyển khoản ứng viên `PREFIX + 8 ký tự [A-Z0-9]` tìm được trong field `code` của SePay rồi trong nội dung chuyển khoản.
 * Ngân hàng có thể đổi hoa/thường và nối thêm chữ phía sau nên chuẩn hoá chữ hoa và cắt đúng độ dài; `code` của SePay có thể
 * bị cắt theo cấu hình nên luôn quét cả nội dung. Không trùng lặp, thứ tự: `code` trước, nội dung sau.
 */
export function extractTransferCodes(prefix: string, code: string | null, content: string): string[] {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}[A-Z0-9]{${TRANSFER_CODE_BODY_LENGTH}}`, 'g');
  const found = new Set<string>();
  for (const source of [code, content]) {
    if (!source) continue;
    for (const match of source.toUpperCase().matchAll(pattern)) found.add(match[0]);
  }
  return [...found];
}
