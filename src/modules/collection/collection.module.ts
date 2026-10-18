import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyModule } from '../currency/currency.module';
import { Product } from '../product/product.entity';
import { AdminCollectionController } from './admin-collection.controller';
import { CollectionController } from './collection.controller';
import { Collection } from './collection.entity';
import { CollectionService } from './collection.service';

@Module({
  imports: [TypeOrmModule.forFeature([Collection, Product]), CurrencyModule],
  controllers: [CollectionController, AdminCollectionController],
  providers: [CollectionService],
  exports: [CollectionService],
})
export class CollectionModule {}
