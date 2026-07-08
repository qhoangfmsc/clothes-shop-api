import { Module } from '@nestjs/common';
import { SizeGuideController } from './size-guide.controller';

@Module({
  controllers: [SizeGuideController],
})
export class SizeGuideModule {}
