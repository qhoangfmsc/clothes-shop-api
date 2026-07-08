import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductService } from './product.service';

@ApiTags('Products')
@Controller('api/products')
@Public()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'List products with optional filters' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category slug' })
  @ApiQuery({ name: 'subcategory', required: false, description: 'Filter by subcategory slug' })
  @ApiQuery({ name: 'badge', required: false, description: 'Filter by badge (new, sale, bestseller)' })
  @ApiQuery({ name: 'sort', required: false, description: 'Sort: price_asc, price_desc, newest' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit results' })
  async findAll(
    @Query('category') category?: string,
    @Query('subcategory') subcategory?: string,
    @Query('badge') badge?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productService.findAll({
      category,
      subcategory,
      badge,
      sort,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID with related products' })
  async findOne(@Param('id') id: string) {
    return this.productService.findById(id);
  }
}
