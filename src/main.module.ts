import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { MainController } from './main.controller';
import { UserModule } from './modules/user/user.module';
import { ProductModule } from './modules/product/product.module';
import { CategoryModule } from './modules/category/category.module';
import { CollectionModule } from './modules/collection/collection.module';
import { ReviewModule } from './modules/review/review.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { SizeGuideModule } from './modules/size-guide/size-guide.module';

@Module({
  imports: [
    CoreModule,
    UserModule,
    ProductModule,
    CategoryModule,
    CollectionModule,
    ReviewModule,
    ShippingModule,
    SizeGuideModule,
  ],
  controllers: [MainController],
  providers: [],
})
export class MainModule {}
