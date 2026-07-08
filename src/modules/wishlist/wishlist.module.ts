import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wishlist } from './wishlist.entity';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [TypeOrmModule.forFeature([Wishlist])],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
