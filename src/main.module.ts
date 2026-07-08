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
  ],
  controllers: [MainController],
  providers: [
    // Global JWT auth guard — all routes require auth by default
    // Use @Public() decorator to open specific routes
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class MainModule {}
