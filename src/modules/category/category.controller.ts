import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { PublicCategoryQueryDto } from './dtos/public-category-query.dto';

@ApiTags('Categories')
@Controller('api/categories')
@Public()
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({ summary: 'List all categories with search, pagination, or get one by slug' })
  @ApiQuery({ name: 'slug', required: false, description: 'Category slug for single lookup (overrides list params)' })
  async find(@Query('slug') slug?: string, @Query() query?: PublicCategoryQueryDto) {
    if (slug) {
      return this.categoryService.findBySlug(slug);
    }
    return this.categoryService.findAllPublic(query || {});
  }
}
