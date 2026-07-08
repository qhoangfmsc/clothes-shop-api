# Controller Conventions

## Template

```typescript
import { ApiEndpoint } from '@common/decorator/api-endpoint.decorator';
import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@common/guards/auth.guard';
import { Roles } from 'src/core/auth/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';

@ApiTags('Feature') // Swagger grouping
@Controller('feature') // Route prefix
@UseGuards(AuthGuard) // Auth required for all routes
@ApiBearerAuth()
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Post()
  @ApiEndpoint('Create feature', { method: 'post' })
  async create(@Body() dto: CreateFeatureDto, @Req() req: any) {
    return this.featureService.create(dto, req.user.id);
  }

  @Get()
  @ApiEndpoint('List features')
  async findAll(@Query() query: ListFeatureDto, @Req() req: any) {
    return this.featureService.findAll(query, req.user.id);
  }

  @Get(':id')
  @ApiEndpoint('Get feature by ID')
  async findById(@Param('id') id: string) {
    return this.featureService.findById(id);
  }

  @Put(':id')
  @ApiEndpoint('Update feature', { method: 'put' })
  async update(@Param('id') id: string, @Body() dto: UpdateFeatureDto, @Req() req: any) {
    return this.featureService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @ApiEndpoint('Delete feature', { method: 'delete' })
  async delete(@Param('id') id: string, @Req() req: any) {
    await this.featureService.delete(id, req.user.id);
    return { message: 'Feature deleted successfully' };
  }
}
```

## Rules

- **Dùng `@ApiEndpoint`** thay cho `@ApiOperation` + `@ApiOkResponse`/`@ApiCreatedResponse`. Cú pháp:
  ```typescript
  @ApiEndpoint('Summary text')                      // GET (default) → @ApiOkResponse
  @ApiEndpoint('Summary text', { method: 'post' })  // POST → @ApiCreatedResponse
  ```
- **Return type thay cho Swagger `type`**: Luôn khai báo return type trên method (e.g. `Promise<FeatureResponse>`). **KHÔNG** dùng `type` trong Swagger decorator — return type đã đủ.
- **Always** use `@ApiTags()` cho Swagger grouping
- **Always** use `@ApiBearerAuth()` if route requires auth
- Admin-only routes: add `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('admin')`
- Access user info via `req.user.id`, `req.user.role`, `req.user.name`
- **Route ordering**: specific routes before parameterized routes (e.g., `@Delete('bulk')` before `@Delete(':id')`)
- Controller should be **thin** — delegate all logic to service
