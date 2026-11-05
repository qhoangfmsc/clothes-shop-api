import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminCategoryController } from './admin-category.controller';
import { CategoryController } from './category.controller';
import { Category } from './category.entity';
import { CategoryService } from './category.service';
import { CategoryQueryService } from './category-query.service';
import { SubCategory } from './sub-category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Category, SubCategory])],
  controllers: [CategoryController, AdminCategoryController],
  providers: [CategoryService, CategoryQueryService],
  exports: [CategoryQueryService],
})
export class CategoryModule {}
