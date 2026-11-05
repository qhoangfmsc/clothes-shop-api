import { buildReviewTestKit } from '../shared/review.test-utils';
import { ReviewAuthoringService } from './review-authoring.service';
import { ReviewAuthoringQueryService } from './review-authoring-query.service';

export function setupAuthoring(seed: Parameters<typeof buildReviewTestKit>[0] = {}) {
  const { dataSource, reviewRepo, mediaService, manager, rows, calls, result } = buildReviewTestKit(seed);
  const queries = new ReviewAuthoringQueryService(dataSource, reviewRepo);
  const service = new ReviewAuthoringService(dataSource, mediaService, queries);
  return { service, queries, manager, rows, calls, result, mediaService };
}
