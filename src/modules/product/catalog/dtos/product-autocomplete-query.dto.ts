import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const AUTOCOMPLETE_DEFAULT_LIMIT = 8;
export const AUTOCOMPLETE_MAX_LIMIT = 10;

export class ProductAutocompleteQueryDto {
  @ApiProperty({ description: 'Search term (minimum 2 characters)' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  q: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: AUTOCOMPLETE_MAX_LIMIT,
    default: AUTOCOMPLETE_DEFAULT_LIMIT,
    description: 'Max suggestions',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUTOCOMPLETE_MAX_LIMIT)
  limit?: number = AUTOCOMPLETE_DEFAULT_LIMIT;
}
