import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './review.entity';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  async findByProductId(productId: string) {
    const reviews = await this.reviewRepo.find({
      where: { productId },
      order: { createdAt: 'DESC' },
    });

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
      total: reviews.length,
    };
  }
}
