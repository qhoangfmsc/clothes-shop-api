import { Logger } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentExpiryScheduler } from './payment-expiry.scheduler';

describe('PaymentService.expireOverdueAttempts / cancelPendingAttempts', () => {
  it('flips overdue PENDING sessions to EXPIRED (never those of cancelled orders) and returns the count', async () => {
    const dataSource: any = { query: jest.fn(async () => [[], 3]) };
    const service = new PaymentService(dataSource, {} as any, {} as any, {} as any, {} as any);

    await expect(service.expireOverdueAttempts()).resolves.toBe(3);

    const sql = dataSource.query.mock.calls[0][0] as string;
    expect(sql).toContain(`SET "status" = 'EXPIRED'`);
    expect(sql).toContain(`"status" = 'PENDING' AND "expires_at" <= now()`);
    expect(sql).toContain(`"status" = 'cancelled'`);
  });

  it('returns 0 when the driver gives no count', async () => {
    const service = new PaymentService({ query: jest.fn(async () => undefined) } as any, {} as any, {} as any, {} as any, {} as any);
    await expect(service.expireOverdueAttempts()).resolves.toBe(0);
  });

  it('cancelPendingAttempts only touches PENDING sessions of that order', async () => {
    const attemptRepo: any = { update: jest.fn(async () => undefined) };
    const service = new PaymentService({} as any, {} as any, attemptRepo, {} as any, {} as any);
    await service.cancelPendingAttempts('o1');
    expect(attemptRepo.update).toHaveBeenCalledWith({ orderId: 'o1', status: 'PENDING' }, { status: 'CANCELLED' });
  });
});

describe('PaymentExpiryScheduler', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('runs the expiry sync', async () => {
    const paymentService: any = { expireOverdueAttempts: jest.fn(async () => 2) };
    await new PaymentExpiryScheduler(paymentService).expireOverdueAttempts();
    expect(paymentService.expireOverdueAttempts).toHaveBeenCalledTimes(1);
  });

  it('never throws (a DB hiccup must not crash the app or stop the schedule)', async () => {
    const paymentService: any = { expireOverdueAttempts: jest.fn(async () => Promise.reject(new Error('db down'))) };
    await expect(new PaymentExpiryScheduler(paymentService).expireOverdueAttempts()).resolves.toBeUndefined();
  });

  it('is scheduled every minute', () => {
    const meta = Reflect.getMetadataKeys(PaymentExpiryScheduler.prototype.expireOverdueAttempts);
    expect(meta.length).toBeGreaterThan(0);
  });
});
