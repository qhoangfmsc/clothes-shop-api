import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorator/public.decorator';
import { CategoryService } from './category.service';

@ApiTags('Categories')
@Controller('api/categories')
@Public()
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({ summary: 'List all categories or get one by slug' })
  @ApiQuery({ name: 'slug', required: false, description: 'Category slug for single lookup' })
  async find(@Query('slug') slug?: string) {
    if (slug) {
      return this.categoryService.findBySlug(slug);
    }
    return this.categoryService.findAll();
  }
}
