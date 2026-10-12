import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PublicCollectionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Collection slug for single lookup' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @SearchField('Search collection name or slug')
  search?: string;

  @SortField(['name', 'createdAt'], '-createdAt')
  sort?: string;
}
