import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductAutocompleteQueryDto } from './dtos/product-autocomplete-query.dto';
import { PublicProductQueryDto } from './dtos/public-product-query.dto';
import { ProductService } from './product.service';

@ApiTags('Products')
@Controller('api/products')
@Public()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'List products with search, filters, sorting, and pagination' })
  async findAll(@Query() query: PublicProductQueryDto) {
    return this.productService.findAllPublic(query);
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Search product suggestions for autocomplete (min 2 chars)' })
  async autocomplete(@Query() query: ProductAutocompleteQueryDto) {
    return this.productService.autocomplete(query.q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID with related products' })
  async findOne(@Param('id') id: string) {
    return this.productService.findById(id);
  }
}
