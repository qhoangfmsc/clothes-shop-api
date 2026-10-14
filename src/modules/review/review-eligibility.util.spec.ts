import { MS_PER_DAY, REVIEW_EDIT_WINDOW_DAYS, REVIEW_WINDOW_DAYS } from './review.constant';
import { computeReviewEligibility, containsLink, reviewEditBlock } from './review-eligibility.util';

const NOW = new Date('2026-06-30T00:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * MS_PER_DAY);
const order = (over: Record<string, any> = {}) => ({ paymentStatus: 'paid', status: 'delivered', deliveredAt: daysAgo(2), ...over });
const item = (over: Record<string, any> = {}) => ({ productId: 'p1', ...over });

describe('computeReviewEligibility', () => {
  it('allows a paid, delivered order inside the window', () => {
    const result = computeReviewEligibility({ order: order(), item: item(), now: NOW });
    expect(result).toMatchObject({ eligible: true, reason: null });
    expect(result.deadline).toEqual(new Date(daysAgo(2).getTime() + REVIEW_WINDOW_DAYS * MS_PER_DAY));
  });

  it('accepts completed orders and refunded payments (the customer did buy the item)', () => {
    expect(computeReviewEligibility({ order: order({ status: 'completed' }), item: item(), now: NOW }).eligible).toBe(true);
    expect(computeReviewEligibility({ order: order({ paymentStatus: 'refunded' }), item: item(), now: NOW }).eligible).toBe(true);
  });

  it('rejects unpaid orders first', () => {
    expect(computeReviewEligibility({ order: order({ paymentStatus: 'unpaid' }), item: item(), now: NOW }).reason).toBe('ORDER_NOT_PAID');
  });

  it.each(['pending', 'confirmed', 'shipping', 'cancelled'])('rejects %s orders', (status) => {
    expect(computeReviewEligibility({ order: order({ status }), item: item(), now: NOW }).reason).toBe('ORDER_NOT_DELIVERED');
  });

  it('rejects a delivered order that has no delivered_at', () => {
    expect(computeReviewEligibility({ order: order({ deliveredAt: null }), item: item(), now: NOW })).toMatchObject({
      eligible: false,
      reason: 'ORDER_NOT_DELIVERED',
      deadline: null,
    });
  });

  it('is inclusive on the last day and rejects right after it', () => {
    expect(computeReviewEligibility({ order: order({ deliveredAt: daysAgo(REVIEW_WINDOW_DAYS) }), item: item(), now: NOW }).eligible).toBe(
      true,
    );
    const late = new Date(daysAgo(REVIEW_WINDOW_DAYS).getTime() - 1);
    expect(computeReviewEligibility({ order: order({ deliveredAt: late }), item: item(), now: NOW }).reason).toBe('REVIEW_WINDOW_EXPIRED');
  });

  it('rejects items whose product was deleted', () => {
    expect(computeReviewEligibility({ order: order(), item: item({ productId: null }), now: NOW }).reason).toBe('PRODUCT_REMOVED');
  });
});

describe('reviewEditBlock', () => {
  const review = (over: Record<string, any> = {}) => ({ createdAt: daysAgo(1), editedAt: null, status: 'PUBLISHED', ...over });

  it('lets the author edit a fresh published review', () => {
    expect(reviewEditBlock(review(), NOW)).toBeNull();
  });

  it('blocks hidden, already-edited and expired reviews', () => {
    expect(reviewEditBlock(review({ status: 'HIDDEN' }), NOW)).toBe('HIDDEN');
    expect(reviewEditBlock(review({ editedAt: daysAgo(0) }), NOW)).toBe('ALREADY_EDITED');
    expect(reviewEditBlock(review({ createdAt: daysAgo(REVIEW_EDIT_WINDOW_DAYS + 1) }), NOW)).toBe('EDIT_WINDOW_EXPIRED');
  });

  it('is inclusive on the last day of the edit window', () => {
    expect(reviewEditBlock(review({ createdAt: daysAgo(REVIEW_EDIT_WINDOW_DAYS) }), NOW)).toBeNull();
  });
});

describe('containsLink', () => {
  it.each(['see https://shop.example/x', 'HTTP://x.y', 'visit www.example.com now'])('detects a link in %s', (text) => {
    expect(containsLink(text)).toBe(true);
  });

  it('ignores plain text and missing values', () => {
    expect(containsLink('Great fit, true to size', '', undefined, null)).toBe(false);
  });

  it('checks every given text', () => {
    expect(containsLink('fine title', 'but www.spam.vn in content')).toBe(true);
  });
});
