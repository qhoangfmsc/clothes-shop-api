import { createFakeManager } from '../../payment/shared/payment.test-utils';
import { buildReturnTestKit } from '../shared/return.test-utils';
import { ReturnProcessingService } from './return-processing.service';
import { ReturnProcessingQueryService } from './return-processing-query.service';

export function setupProcessing(seed: Parameters<typeof createFakeManager>[0] = {}, policyDays = 30) {
  const { dataSource, shipping, refundService, returnRepo, manager, rows, calls } = buildReturnTestKit(seed, policyDays);
  const queries = new ReturnProcessingQueryService(dataSource, returnRepo);
  const service = new ReturnProcessingService(dataSource, refundService, queries);
  return { service, queries, manager, rows, calls, shipping, returnRepo };
}
