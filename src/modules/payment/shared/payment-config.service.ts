import { throwAppError } from '@common/exceptions/app.exception';
import { EPaymentErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_TRANSFER_PREFIX } from './payment.constant';

export interface QrConfig {
  bankCode: string;
  bankName: string;
  account: string;
  accountName: string;
  prefix: string;
}

export interface WebhookConfig {
  secret: string;
  account: string;
  prefix: string;
}

const ENV_NAMES: Record<string, string> = {
  bankCode: 'SEPAY_RECEIVING_BANK_CODE',
  bankName: 'SEPAY_RECEIVING_BANK_NAME',
  account: 'SEPAY_RECEIVING_ACCOUNT',
  accountName: 'SEPAY_RECEIVING_ACCOUNT_NAME',
  secret: 'SEPAY_WEBHOOK_SECRET',
  prefix: 'PAYMENT_TRANSFER_PREFIX',
};

/** Đọc cấu hình thanh toán từ env; thiếu hoặc sai → `PAYMENT_NOT_CONFIGURED` (503), không có giá trị mặc định cho secret/tài khoản */
@Injectable()
export class PaymentConfigService {
  constructor(private readonly config: ConfigService) {}

  getQrConfig(): QrConfig {
    return this.require({
      bankCode: this.read('SEPAY_RECEIVING_BANK_CODE'),
      bankName: this.read('SEPAY_RECEIVING_BANK_NAME'),
      account: this.read('SEPAY_RECEIVING_ACCOUNT'),
      accountName: this.read('SEPAY_RECEIVING_ACCOUNT_NAME'),
      prefix: this.prefix(),
    });
  }

  getWebhookConfig(): WebhookConfig {
    return this.require({
      secret: this.read('SEPAY_WEBHOOK_SECRET'),
      account: this.read('SEPAY_RECEIVING_ACCOUNT'),
      prefix: this.prefix(),
    });
  }

  private read(key: string): string | undefined {
    return this.config.get<string>(key)?.trim() || undefined;
  }

  private prefix(): string | undefined {
    const prefix = (this.read('PAYMENT_TRANSFER_PREFIX') ?? DEFAULT_TRANSFER_PREFIX).toUpperCase();
    return /^[A-Z0-9]{2,8}$/.test(prefix) ? prefix : undefined;
  }

  private require<T extends object>(values: { [K in keyof T]: T[K] | undefined }): T {
    const missing = Object.entries(values)
      .filter(([, value]) => value === undefined)
      .map(([key]) => ENV_NAMES[key] ?? key);
    if (missing.length) {
      throwAppError(
        EPaymentErrorCode.PAYMENT_NOT_CONFIGURED,
        `Payment is not configured (${missing.join(', ')})`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return values as T;
  }
}
