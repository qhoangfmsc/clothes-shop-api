import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyModule } from '../currency/currency.module';
import { Product } from '../product/product.entity';
import { WishlistController } from './wishlist.controller';
import { Wishlist } from './wishlist.entity';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [TypeOrmModule.forFeature([Wishlist, Product]), CurrencyModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
