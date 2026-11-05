import { isUniqueViolation } from '@common/base/db-error.util';
import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EMediaErrorCode, EReviewErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { REVIEW_IMAGE_MAX_FILE_SIZE } from '../../media/media.constant';
import { MediaService } from '../../media/media.service';
import { Order } from '../../order/shared/order.entity';
import { OrderItem } from '../../order/shared/order-item.entity';
import { User } from '../../user/user.entity';
import { ReviewFit } from '../shared/review.constant';
import { Review } from '../shared/review.entity';
import {
  computeReviewEligibility,
  containsLink,
  REVIEW_EDIT_BLOCK_MESSAGES,
  REVIEW_INELIGIBLE_MESSAGES,
  reviewEditBlock,
} from '../shared/review-eligibility.util';
import { lockProduct, refreshProductRating } from '../shared/review-rating.util';
import { CreateReviewDto } from './dtos/create-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import { ReviewAuthoringQueryService } from './review-authoring-query.service';

@Injectable()
export class ReviewAuthoringService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly mediaService: MediaService,
    private readonly queryService: ReviewAuthoringQueryService,
  ) {}

  async create(user: User, dto: CreateReviewDto) {
    if (containsLink(dto.title, dto.content)) throwAppError(EReviewErrorCode.REVIEW_CONTENT_NOT_ALLOWED);
    const images = await this.resolveImages(user.id, dto.images);

    let saved: Review;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const item = await manager.findOne(OrderItem, { where: { id: dto.orderItemId } });
        const order = item && (await manager.findOne(Order, { where: { id: item.orderId, userId: user.id } }));
        if (!item || !order) throwAppError(EReviewErrorCode.REVIEW_NOT_ALLOWED, 'Order item not found', HttpStatus.NOT_FOUND);

        const eligibility = computeReviewEligibility({ order, item });
        if (!eligibility.eligible) {
          throwAppError(EReviewErrorCode.REVIEW_NOT_ALLOWED, REVIEW_INELIGIBLE_MESSAGES[eligibility.reason!]);
        }
        if (await manager.exists(Review, { where: { orderItemId: item.id } })) {
          throwAppError(EReviewErrorCode.REVIEW_ALREADY_EXISTS, undefined, HttpStatus.CONFLICT);
        }

        // Khoá sản phẩm TRƯỚC khi chèn đánh giá (FK của dòng mới sẽ giữ khoá chia sẻ trên sản phẩm; khoá sau sẽ bế tắc khi hai đánh giá đồng thời)
        await lockProduct(manager, item.productId as string);

        const review = await manager.save(
          manager.create(Review, {
            productId: item.productId as string,
            userId: user.id,
            orderItemId: item.id,
            author: user.name?.trim() || 'Customer',
            avatar: user.image ?? '',
            rating: dto.rating,
            date: new Date().toISOString().slice(0, 10),
            title: dto.title ?? '',
            content: dto.content ?? '',
            verified: true,
            size: item.size,
            color: item.color,
            fit: (dto.fit as ReviewFit | undefined) ?? null,
            images,
            status: 'PUBLISHED',
            helpfulCount: 0,
            editedAt: null,
            moderationNote: null,
            moderatedBy: null,
            moderatedAt: null,
            reply: null,
            repliedBy: null,
            repliedAt: null,
          }),
        );
        await refreshProductRating(manager, review.productId);
        return review;
      });
    } catch (err) {
      // Hai request đồng thời cho cùng một dòng hàng: UNIQUE(order_item_id) chặn bản thứ hai
      if (isUniqueViolation(err)) throwAppError(EReviewErrorCode.REVIEW_ALREADY_EXISTS, undefined, HttpStatus.CONFLICT);
      throw err;
    }
    return this.queryService.findOneOwn(saved.id);
  }

  /** Sửa đánh giá của mình — một lần, trong hạn sửa, khi chưa bị ẩn */
  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    if (
      dto.rating === undefined &&
      dto.title === undefined &&
      dto.content === undefined &&
      dto.fit === undefined &&
      dto.images === undefined
    ) {
      throwAppError(EReviewErrorCode.REVIEW_NOTHING_TO_UPDATE);
    }
    if (containsLink(dto.title, dto.content)) throwAppError(EReviewErrorCode.REVIEW_CONTENT_NOT_ALLOWED);
    const images = dto.images === undefined ? undefined : await this.resolveImages(userId, dto.images);

    await this.dataSource.transaction(async (manager) => {
      const review = await findLocked(manager, Review, { id: reviewId, userId });
      if (!review) throwAppError(EReviewErrorCode.REVIEW_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

      const block = reviewEditBlock(review);
      if (block) throwAppError(EReviewErrorCode.REVIEW_EDIT_NOT_ALLOWED, REVIEW_EDIT_BLOCK_MESSAGES[block]);

      if (dto.rating !== undefined) review.rating = dto.rating;
      if (dto.title !== undefined) review.title = dto.title;
      if (dto.content !== undefined) review.content = dto.content;
      if (dto.fit !== undefined) review.fit = dto.fit as ReviewFit;
      if (images !== undefined) review.images = images;
      review.editedAt = new Date();
      await manager.save(review);

      if (dto.rating !== undefined) {
        await lockProduct(manager, review.productId);
        await refreshProductRating(manager, review.productId);
      }
    });
    return this.queryService.findOneOwn(reviewId);
  }

  /** Upload 1 ảnh để đính vào đánh giá (chưa gắn vào đánh giá nào; gửi URL trả về ở `images` của create/update) */
  async uploadImage(userId: string, file?: Express.Multer.File) {
    if (file && file.size > REVIEW_IMAGE_MAX_FILE_SIZE) {
      throwAppError(EMediaErrorCode.MEDIA_FILE_TOO_LARGE, undefined, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    const { data } = await this.mediaService.upload(file, { purpose: 'REVIEW', uploadedBy: userId });
    return { data: { url: data.url, mimeType: data.mimeType, size: data.sizeOriginal } };
  }

  /** Ảnh gửi lên phải là ảnh đánh giá do chính user upload; trả URL chuẩn hoá (không có ảnh → `[]`) */
  private async resolveImages(userId: string, urls: string[] | undefined): Promise<string[]> {
    if (!urls || urls.length === 0) return [];
    const resolved = await this.mediaService.resolveReviewImageUrls(userId, urls);
    if (!resolved) throwAppError(EReviewErrorCode.REVIEW_IMAGE_INVALID);
    return resolved;
  }
}
