import { throwAppError } from '@common/exceptions/app.exception';
import { EReviewErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Review } from './review.entity';

export async function findReviewWithProduct(reviewRepo: Repository<Review>, reviewId: string): Promise<Review> {
  const review = await reviewRepo.findOne({
    where: { id: reviewId },
    relations: { product: { category: true, subcategory: true } },
  });
  if (!review) throwAppError(EReviewErrorCode.REVIEW_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
  return review;
}
