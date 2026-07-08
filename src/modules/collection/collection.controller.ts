import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CollectionService } from './collection.service';

@ApiTags('Collections')
@Controller('api/collections')
@Public()
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get()
  @ApiOperation({ summary: 'List all collections or get one by slug' })
  @ApiQuery({ name: 'slug', required: false, description: 'Collection slug for single lookup' })
  async find(@Query('slug') slug?: string) {
    if (slug) {
      return this.collectionService.findBySlug(slug);
    }
    return this.collectionService.findAll();
  }
}
