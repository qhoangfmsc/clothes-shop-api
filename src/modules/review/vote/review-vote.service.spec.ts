import { Product } from '../../product/product.entity';
import { Review } from '../shared/review.entity';
import { rejects, review } from '../shared/review.test-utils';
import { ReviewVote } from '../shared/review-vote.entity';
import { setupVote } from './vote.test-utils';

describe('ReviewService votes', () => {
  const others = () => ({ reviews: [review({ userId: 'author' })] });

  it('counts a vote once, even when sent twice', async () => {
    const { service, rows } = setupVote(others());
    expect((await service.vote('u1', 'r1')).data).toEqual({ reviewId: 'r1', helpfulCount: 1, voted: true });
    expect((await service.vote('u1', 'r1')).data).toEqual({ reviewId: 'r1', helpfulCount: 1, voted: true });
    expect(rows(ReviewVote)).toHaveLength(1);
    expect(rows(Review)[0].helpfulCount).toBe(1);
  });

  it('counts votes from different users and removes only the caller vote', async () => {
    const { service, rows } = setupVote({ ...others(), votes: [{ id: 'v1', reviewId: 'r1', userId: 'u2' }] });
    expect((await service.vote('u1', 'r1')).data.helpfulCount).toBe(2);
    expect((await service.unvote('u1', 'r1')).data).toEqual({ reviewId: 'r1', helpfulCount: 1, voted: false });
    expect(rows(ReviewVote).map((v) => v.userId)).toEqual(['u2']);
  });

  it('unvote without a vote is a no-op', async () => {
    const { service } = setupVote(others());
    expect((await service.unvote('u1', 'r1')).data).toMatchObject({ helpfulCount: 0, voted: false });
  });

  it('refuses to vote on your own review', async () => {
    const { service, rows } = setupVote({ reviews: [review({ userId: 'u1' })] });
    await rejects(service.vote('u1', 'r1'), { errorCode: 1907, status: 400 });
    expect(rows(ReviewVote)).toHaveLength(0);
  });

  it('404s on hidden or unknown reviews and locks the review row', async () => {
    const { service, manager } = setupVote({ reviews: [review({ userId: 'author', status: 'HIDDEN', moderationNote: 'x' })] });
    await rejects(service.vote('u1', 'r1'), { errorCode: 1901, status: 404 });
    await rejects(service.vote('u1', 'nope'), { errorCode: 1901, status: 404 });
    expect(manager.locks).toEqual(['Review', 'Review']);
  });
});

describe('ReviewVoteService keeps products.rating_* alone', () => {
  it('votes leave the product rating alone', async () => {
    const ctx = setupVote({ reviews: [review({ userId: 'author' })] });
    await ctx.service.vote('u1', 'r1');
    expect(ctx.manager.update.mock.calls.some(([entity]: any) => entity === Product)).toBe(false);
  });
});
