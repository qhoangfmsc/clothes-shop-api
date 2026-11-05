import { type MoneyFields, money } from '@common/utils/money.util';

/**
 * Số tiền thanh toán/hoàn lưu bằng VND (số nguyên, đúng số ngân hàng thực chuyển). USD chỉ để hiển thị, suy ra theo tỷ giá
 * chốt trên đơn (`orders.exchange_rate`) nên không đổi khi admin đổi tỷ giá sau đó.
 */

/** Thay `amount` bằng `amountVnd`/`amountUsd` */
export function presentAmount<T extends { amount: number }>(row: T, vndPerUsd: number): Omit<T, 'amount'> & MoneyFields<'amount'> {
  const { amount, ...rest } = row;
  return { ...rest, ...money('amount', amount, vndPerUsd) };
}

/** Thay `total` của đơn (tóm tắt) bằng `totalVnd`/`totalUsd`, giữ `exchangeRate` */
export function presentOrderTotal<T extends { total: number }>(order: T, vndPerUsd: number): Omit<T, 'total'> & MoneyFields<'total'> {
  const { total, ...rest } = order;
  return { ...rest, ...money('total', total, vndPerUsd) };
}
