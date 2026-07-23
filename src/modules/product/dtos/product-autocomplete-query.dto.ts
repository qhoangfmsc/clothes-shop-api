import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ProductAutocompleteQueryDto {
  @ApiProperty({ description: 'Search term (minimum 2 characters)' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  q: string;
}
