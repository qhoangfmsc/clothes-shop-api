import { ApiResponseProperty } from '@nestjs/swagger';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from './pagination.util';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type Normal<S extends string> = S;

export type AsTypeSort<T> = {
  [P in keyof T as `-${Normal<string & P>}`]: T[P];
};

export interface BaseListProps<T> {
  page?: number | undefined;
  limit?: number | undefined;
  search?: string | undefined;
  searchProps?: (keyof T)[] | undefined;
  sort?: string | undefined;
  filter?: DeepPartial<T>;
  relations?: (keyof T | string)[];
}

export class Paging<T> {
  items: T[] = [];
  total = 0;
  page = DEFAULT_PAGE;
  limit = DEFAULT_PAGE_SIZE;
  totalPages = 0;
}

export class BadRequestErrorResponse {
  @ApiResponseProperty({ type: Number, example: 400 })
  errorCode = 0;

  @ApiResponseProperty({ type: String, example: 'Thông báo lỗi chi tiết.' })
  message = 'Error message here';
}
