import { ApiResponseProperty } from '@nestjs/swagger';

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
  sorts?: string | undefined;
  filter?: DeepPartial<T>;
  relations?: (keyof T | string)[];
}

export class Paging<T> {
  items: T[] = [];
  total = 0;
  page = 1;
  limit = 20;
  totalPages = 0;
}

export class BadRequestErrorResponse {
  @ApiResponseProperty({ type: Number, example: 400 })
  errorCode = 0;

  @ApiResponseProperty({ type: String, example: 'Thông báo lỗi chi tiết.' })
  message = 'Error message here';
}
