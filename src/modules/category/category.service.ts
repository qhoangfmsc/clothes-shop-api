import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async findAll() {
    const categories = await this.categoryRepo.find({
      order: { createdAt: 'ASC' },
    });

    const data = categories.map((cat) => ({
      slug: cat.slug,
      title: cat.title,
      description: cat.description,
      subcategories: (cat.subcategories || []).map((sub) => ({
        slug: sub.slug,
        label: sub.label,
        description: sub.description,
        count: sub.count,
      })),
    }));

    return { data, total: data.length };
  }

  async findBySlug(slug: string) {
    const category = await this.categoryRepo.findOne({ where: { slug } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      data: {
        slug: category.slug,
        title: category.title,
        description: category.description,
        subcategories: (category.subcategories || []).map((sub) => ({
          slug: sub.slug,
          label: sub.label,
          description: sub.description,
          count: sub.count,
        })),
      },
    };
  }
}
