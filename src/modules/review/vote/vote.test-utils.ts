import { buildReviewTestKit } from '../shared/review.test-utils';
import { ReviewVoteService } from './review-vote.service';

export function setupVote(seed: Parameters<typeof buildReviewTestKit>[0] = {}) {
  const { dataSource, manager, rows, calls, result } = buildReviewTestKit(seed);
  const service = new ReviewVoteService(dataSource);
  return { service, manager, rows, calls, result };
}
