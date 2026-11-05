import { buildReviewTestKit } from '../shared/review.test-utils';
import { ReviewPublicQueryService } from './review-public-query.service';

export function setupPublic(seed: Parameters<typeof buildReviewTestKit>[0] = {}) {
  const { dataSource, reviewRepo, manager, rows, calls, result } = buildReviewTestKit(seed);
  const queries = new ReviewPublicQueryService(dataSource, reviewRepo);
  return { queries, manager, rows, calls, result };
}
