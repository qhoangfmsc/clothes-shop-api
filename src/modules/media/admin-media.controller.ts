import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MediaQueryDto } from './dtos/media-query.dto';
import { MEDIA_MAX_FILE_SIZE } from './media.constant';
import { MediaService } from './media.service';

@ApiTags('Admin — Media')
@Controller('api/admin/media')
@ApiBearerAuth()
export class AdminMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get('ping')
  @ApiOperation({ summary: '[Admin] Kiểm tra kết nối Supabase Storage' })
  @Permissions(Permission.MEDIA_VIEW)
  ping() {
    return this.mediaService.ping();
  }

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách file media (mới nhất trước, phân trang)' })
  @Permissions(Permission.MEDIA_VIEW)
  findAll(@Query() query: MediaQueryDto) {
    return this.mediaService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Upload 1 ảnh (multipart, field "file")' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @Permissions(Permission.MEDIA_UPLOAD)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_FILE_SIZE, files: 1 }, defParamCharset: 'utf8' }))
  upload(@UploadedFile() file?: Express.Multer.File) {
    return this.mediaService.upload(file);
  }

  @Delete(':fileId')
  @ApiOperation({ summary: '[Admin] Xoá 1 file media' })
  @Permissions(Permission.MEDIA_DELETE)
  delete(@Param('fileId') fileId: string) {
    return this.mediaService.delete(fileId);
  }
}
