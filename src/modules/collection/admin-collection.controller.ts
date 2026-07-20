import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { AdminCollectionQueryDto } from './dtos/admin-collection-query.dto';
import { CreateCollectionDto, UpdateCollectionDto } from './dtos/collection.dto';

@ApiTags('Admin — Collections')
@Controller('api/admin/collections')
@ApiBearerAuth()
export class AdminCollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách bộ sưu tập (search, filter, sort, pagination)' })
  @Permissions(Permission.COLLECTION_CREATE)
  findAll(@Query() query: AdminCollectionQueryDto) {
    return this.collectionService.findAllAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Tạo bộ sưu tập mới' })
  @Permissions(Permission.COLLECTION_CREATE)
  create(@Body() dto: CreateCollectionDto) {
    return this.collectionService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Cập nhật bộ sưu tập' })
  @Permissions(Permission.COLLECTION_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.collectionService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Admin] Xoá bộ sưu tập' })
  @Permissions(Permission.COLLECTION_DELETE)
  delete(@Param('id') id: string) {
    return this.collectionService.delete(id);
  }
}
