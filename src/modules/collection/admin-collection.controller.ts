import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { CreateCollectionDto, UpdateCollectionDto } from './dtos/collection.dto';

@ApiTags('Admin — Collections')
@Controller('api/admin/collections')
@ApiBearerAuth()
export class AdminCollectionController {
  constructor(private readonly collectionService: CollectionService) {}

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
