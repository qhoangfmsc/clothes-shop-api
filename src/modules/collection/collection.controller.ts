import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { PublicCollectionQueryDto } from './dtos/public-collection-query.dto';

@ApiTags('Collections')
@Controller('api/collections')
@Public()
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get()
  @ApiOperation({ summary: 'List all collections with search, pagination, or get one by slug' })
  @ApiQuery({ name: 'slug', required: false, description: 'Collection slug for single lookup (overrides list params)' })
  async find(@Query('slug') slug?: string, @Query() query?: PublicCollectionQueryDto) {
    if (slug) {
      return this.collectionService.findBySlug(slug);
    }
    return this.collectionService.findAllPublic(query || {});
  }
}
