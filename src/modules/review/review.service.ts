import { parseSort } from '@common/base/sort.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicReviewQueryDto } from './dtos/public-review-query.dto';
import { Review } from './review.entity';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  async findByProductId(productId: string, query: PublicReviewQueryDto = {}) {
    const { sort } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const qb = this.reviewRepo.createQueryBuilder('r').where('r.productId = :productId', { productId });

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`r.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [reviews, total] = await qb.getManyAndCount();

    return {
      data: reviews.map((r) => ({
        id: r.id,
        author: r.author,
        avatar: r.avatar,
        rating: r.rating,
        date: r.date,
        title: r.title,
        content: r.content,
        verified: r.verified,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
