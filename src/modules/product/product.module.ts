import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../category/category.entity';
import { SubCategory } from '../category/sub-category.entity';
import { CurrencyModule } from '../currency/currency.module';
import { AdminProductController } from './admin/admin-product.controller';
import { ProductAdminService } from './admin/product-admin.service';
import { ProductAdminQueryService } from './admin/product-admin-query.service';
import { ProductCatalogController } from './catalog/product-catalog.controller';
import { ProductCatalogQueryService } from './catalog/product-catalog-query.service';
import { Product } from './shared/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Category, SubCategory]), CurrencyModule],
  controllers: [ProductCatalogController, AdminProductController],
  providers: [ProductCatalogQueryService, ProductAdminQueryService, ProductAdminService],
  exports: [ProductCatalogQueryService],
})
export class ProductModule {}
