import { buildReviewTestKit } from '../shared/review.test-utils';
import { ReviewModerationService } from './review-moderation.service';
import { ReviewModerationQueryService } from './review-moderation-query.service';

export function setupModeration(seed: Parameters<typeof buildReviewTestKit>[0] = {}) {
  const { dataSource, reviewRepo, manager, rows, calls, result } = buildReviewTestKit(seed);
  const queries = new ReviewModerationQueryService(dataSource, reviewRepo);
  const service = new ReviewModerationService(dataSource, queries);
  return { service, queries, manager, rows, calls, result };
}
