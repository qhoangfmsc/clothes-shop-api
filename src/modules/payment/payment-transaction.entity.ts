import { BaseEntity } from '@common/base/base.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { PAYMENT_PROVIDER_SEPAY, PaymentVerificationStatus } from './payment.constant';
import { bigintTransformer, PaymentAttempt } from './payment-attempt.entity';

@Unique('UQ_payment_transactions_provider_and_transaction_id', ['provider', 'providerTransactionId'])
@Entity('payment_transactions')
export class PaymentTransaction extends BaseEntity {
  /** Null khi giao dịch không khớp phiên nào (UNMATCHED, ACCOUNT_MISMATCH, IGNORED) */
  @Column({ type: 'varchar', length: 16, name: 'payment_attempt_id', nullable: true })
  paymentAttemptId: string | null;

  /** Mã giao dịch đúng nguyên văn (id SePay, hoặc mã tham chiếu ngân hàng admin nhập) — hiển thị y hệt cho khách và admin; UNIQUE cùng `provider` */
  @Column({ type: 'varchar', length: 64, name: 'provider_transaction_id' })
  providerTransactionId: string;

  @Column({ type: 'varchar', length: 20, default: PAYMENT_PROVIDER_SEPAY })
  provider: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: number;

  @Column({ type: 'varchar', length: 500, name: 'transfer_content', default: '' })
  transferContent: string;

  /** Payload nguyên văn SePay gửi (không chứa chữ ký/secret — hai thứ này nằm ở header) */
  @Column({ type: 'jsonb', name: 'raw_payload' })
  rawPayload: Record<string, unknown>;

  @Column({ type: 'timestamp with time zone', name: 'received_at', default: () => 'now()' })
  receivedAt: Date;

  @Column({ type: 'varchar', length: 20, name: 'verification_status' })
  verificationStatus: PaymentVerificationStatus;

  /** Admin xác nhận thủ công (chỉ có khi `verification_status = MANUALLY_CONFIRMED`) */
  @Column({ type: 'varchar', length: 16, name: 'confirmed_by', nullable: true })
  confirmedBy: string | null;

  @Column({ type: 'timestamp with time zone', name: 'confirmed_at', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'varchar', length: 500, name: 'confirm_note', nullable: true })
  confirmNote: string | null;

  @ManyToOne(() => PaymentAttempt, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'payment_attempt_id' })
  paymentAttempt: PaymentAttempt | null;
}
