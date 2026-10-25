import { createFakeManager } from '../../payment/shared/payment.test-utils';
import { buildReturnTestKit } from '../shared/return.test-utils';
import { ReturnRequestService } from './return-request.service';
import { ReturnRequestQueryService } from './return-request-query.service';

export function setupRequest(seed: Parameters<typeof createFakeManager>[0] = {}, policyDays = 30) {
  const { dataSource, shipping, refundService, returnRepo, manager, rows, calls } = buildReturnTestKit(seed, policyDays);
  const queries = new ReturnRequestQueryService(dataSource, returnRepo, shipping);
  const service = new ReturnRequestService(dataSource, shipping, queries);
  return { service, queries, manager, rows, calls, shipping, returnRepo, refundService };
}
