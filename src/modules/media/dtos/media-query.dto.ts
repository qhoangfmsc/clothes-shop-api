import { FindBaseDto } from '@common/dto/find-base.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** search (theo tên) và sorts (createdAt | name | size, prefix "-" = giảm dần) kế thừa từ FindBaseDto; sorts sai → 400 */
export class MediaQueryDto extends FindBaseDto {
  @ApiPropertyOptional({ default: 24, maximum: 200, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  override limit = 24;
}
