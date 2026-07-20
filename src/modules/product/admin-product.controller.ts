import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminProductQueryDto } from './dtos/admin-product-query.dto';
import { CreateProductDto, UpdateProductDto } from './dtos/product.dto';
import { ProductService } from './product.service';

@ApiTags('Admin — Products')
@Controller('api/admin/products')
@ApiBearerAuth()
export class AdminProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách sản phẩm (search, filter, sort, pagination)' })
  @Permissions(Permission.PRODUCT_CREATE)
  findAll(@Query() query: AdminProductQueryDto) {
    return this.productService.findAllAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Tạo sản phẩm mới' })
  @Permissions(Permission.PRODUCT_CREATE)
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Cập nhật sản phẩm' })
  @Permissions(Permission.PRODUCT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Admin] Xoá sản phẩm' })
  @Permissions(Permission.PRODUCT_DELETE)
  delete(@Param('id') id: string) {
    return this.productService.delete(id);
  }
}
