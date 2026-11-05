import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrencyService } from '../../currency/currency.service';
import { presentAmount, presentOrderTotal } from '../shared/payment.presenter';
import { PaymentTransaction } from '../shared/payment-transaction.entity';
import { AdminPaymentTransactionQueryDto } from './dtos/admin-payment-transaction-query.dto';
import { applyTransactionNeedsReviewFilter } from './payment-needs-review.util';

@Injectable()
export class PaymentTransactionQueryService {
  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    private readonly currencyService: CurrencyService,
  ) {}

  /** [Admin] Giao dịch ngân hàng đã nhận (kể cả chưa khớp) để đối soát */
  async findTransactionsAdmin(query: AdminPaymentTransactionQueryDto) {
    const { orderId, verificationStatus, search, needsReview, sort } = query;
    const { page, limit } = getPaging(query);

    // Kèm tóm tắt đơn của phiên khớp (chỉ vài cột) để màn đối soát không phải gọi thêm API
    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.paymentAttempt', 'a')
      .leftJoin('a.order', 'o')
      .addSelect(['o.id', 'o.status', 'o.paymentStatus', 'o.total', 'o.exchangeRate', 'o.userId']);

    if (orderId) qb.andWhere('a.order_id = :orderId', { orderId });
    // Chỉ giao dịch cần admin xử lý (cùng điều kiện với con số trên menu admin)
    if (needsReview) applyTransactionNeedsReviewFilter(qb);
    if (verificationStatus) qb.andWhere('t.verification_status = :verificationStatus', { verificationStatus });
    if (search) {
      qb.andWhere('(t.transfer_content ILIKE :search OR t.provider_transaction_id ILIKE :search OR a.transfer_code ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-receivedAt');
    qb.orderBy(`t.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const currentRate = await this.currencyService.getVndPerUsd();

    // USD theo tỷ giá của đơn khớp; giao dịch chưa khớp đơn nào thì theo tỷ giá hiện tại
    const presented = data.map((transaction) => {
      const attempt = transaction.paymentAttempt;
      const rate = attempt?.order?.exchangeRate ?? currentRate;
      return {
        ...presentAmount(transaction, rate),
        paymentAttempt: attempt
          ? {
              ...presentAmount(attempt, rate),
              order: attempt.order ? presentOrderTotal(attempt.order, rate) : attempt.order,
            }
          : attempt,
      };
    });
    return paginated(presented, total, page, limit);
  }

  /** Số giao dịch cần admin xử lý — cùng điều kiện với bộ lọc `needsReview` của `findTransactionsAdmin` */
  async countNeedsReview(): Promise<number> {
    const qb = this.transactionRepo.createQueryBuilder('t').leftJoin('t.paymentAttempt', 'a').leftJoin('a.order', 'o');
    return applyTransactionNeedsReviewFilter(qb).getCount();
  }
}
