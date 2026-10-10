import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminMediaController } from './admin-media.controller';
import { MediaService } from './media.service';
import { MediaFile } from './media-file.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MediaFile])],
  controllers: [AdminMediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
