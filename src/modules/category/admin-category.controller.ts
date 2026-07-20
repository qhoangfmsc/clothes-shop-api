import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { AdminCategoryQueryDto } from './dtos/admin-category-query.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dtos/category.dto';

@ApiTags('Admin — Categories')
@Controller('api/admin/categories')
@ApiBearerAuth()
export class AdminCategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách danh mục (search, sort, pagination)' })
  @Permissions(Permission.CATEGORY_CREATE)
  findAll(@Query() query: AdminCategoryQueryDto) {
    return this.categoryService.findAllAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Tạo danh mục mới (kèm subcategories)' })
  @Permissions(Permission.CATEGORY_CREATE)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Cập nhật danh mục' })
  @Permissions(Permission.CATEGORY_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Admin] Xoá danh mục' })
  @Permissions(Permission.CATEGORY_DELETE)
  delete(@Param('id') id: string) {
    return this.categoryService.delete(id);
  }
}
