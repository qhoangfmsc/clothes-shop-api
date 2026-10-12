import { sortValues } from '@common/base/sort.util';
import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Field `sort` chuẩn cho mọi DTO list: whitelist `fields`, `field` = ASC, `-field` = DESC.
 * `defaultSort` chỉ để hiển thị trên Swagger — service phải truyền cùng giá trị vào parseSort().
 */
export function SortField(fields: readonly string[], defaultSort: string) {
  const values = sortValues(fields);
  return applyDecorators(
    ApiPropertyOptional({
      enum: values,
      example: defaultSort,
      description: `Sort: field = ASC, -field = DESC. Mặc định: ${defaultSort}`,
    }),
    IsOptional(),
    IsString(),
    IsIn(values),
  );
}
