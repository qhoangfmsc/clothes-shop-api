import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../product/product.entity';
import { CollectionController } from './collection.controller';
import { Collection } from './collection.entity';
import { CollectionService } from './collection.service';

@Module({
  imports: [TypeOrmModule.forFeature([Collection, Product])],
  controllers: [CollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
