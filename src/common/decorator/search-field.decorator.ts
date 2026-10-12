import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Field `search` chuẩn cho mọi DTO list: chuỗi tối đa 255 ký tự; `description` nêu các cột được tìm */
export function SearchField(description: string) {
  return applyDecorators(ApiPropertyOptional({ description, maxLength: 255 }), IsOptional(), IsString(), MaxLength(255));
}
