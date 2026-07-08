import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from './core/core.module';
import { MainController } from './main.controller';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProductModule } from './modules/product/product.module';
import { CategoryModule } from './modules/category/category.module';
import { CollectionModule } from './modules/collection/collection.module';
import { ReviewModule } from './modules/review/review.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { SizeGuideModule } from './modules/size-guide/size-guide.module';
import { AddressModule } from './modules/address/address.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { CartModule } from './modules/cart/cart.module';
import { OrderModule } from './modules/order/order.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';

@Module({
  imports: [
    CoreModule,
    AuthModule,
    UserModule,
    ProductModule,
    CategoryModule,
    CollectionModule,
    ReviewModule,
    ShippingModule,
    SizeGuideModule,
    AddressModule,
    WishlistModule,
    CartModule,
    OrderModule,
  ],
  controllers: [MainController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class MainModule {}
