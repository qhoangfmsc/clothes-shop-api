import { BadRequestException } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Paging } from './base.interface';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TypeormListQueryProps {
  page?: number;
  limit?: number;
  search?: string;
  sorts?: string;
  /** Filter map, values may include operator prefix like "gt:10", "in:1,2,3" */
  filter?: Record<string, any>;
}

export interface TypeormListQueryOptions {
  /** Các cột được phép sort. Mặc định ['id'] */
  sortableColumns?: string[];
  /** Các cột được phép search (sẽ dùng ILIKE) */
  searchableColumns?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a single filter condition from a value that may contain an operator prefix.
 *
 * Supported:  lt:v  lte:v  gt:v  gte:v  ne:v  eq:v  in:a,b,c  range:a,b
 * Plain value → eq
 */
function applyFilterCondition(qb: SelectQueryBuilder<any>, alias: string, column: string, value: any, paramIndex: number): number {
  const paramName = `filter_${column}_${paramIndex}`;
  const colRef = `${alias}.${column}`;

  const regex = /^(lt|lte|gt|gte|ne|in|range|eq):(.*)$/;
  const strValue = `${value}`;
  const match = strValue.match(regex);

  if (match?.[2]) {
    const operator = match[1];
    const operand = match[2];

    switch (operator) {
      case 'lt':
        qb.andWhere(`${colRef} < :${paramName}`, { [paramName]: operand });
        break;
      case 'lte':
        qb.andWhere(`${colRef} <= :${paramName}`, { [paramName]: operand });
        break;
      case 'gt':
        qb.andWhere(`${colRef} > :${paramName}`, { [paramName]: operand });
        break;
      case 'gte':
        qb.andWhere(`${colRef} >= :${paramName}`, { [paramName]: operand });
        break;
      case 'ne':
        if (operand === 'null') {
          qb.andWhere(`${colRef} IS NOT NULL`);
        } else {
          qb.andWhere(`${colRef} != :${paramName}`, { [paramName]: operand });
        }
        break;
      case 'eq':
        if (operand === 'null') {
          qb.andWhere(`${colRef} IS NULL`);
        } else {
          qb.andWhere(`${colRef} = :${paramName}`, { [paramName]: operand });
        }
        break;
      case 'in': {
        const vals = operand.split(',').map((v) => v.trim());
        qb.andWhere(`${colRef} IN (:...${paramName})`, { [paramName]: vals });
        break;
      }
      case 'range': {
        const parts = operand.split(',').map((v) => v.trim());
        if (parts.length !== 2) {
          throw new BadRequestException('Invalid range value for filter');
        }
        // Nếu giá trị end là date-only (YYYY-MM-DD) → thêm cuối ngày để BETWEEN bao gồm cả ngày
        const fromVal = parts[0];
        let toVal = parts[1];
        if (/^\d{4}-\d{2}-\d{2}$/.test(toVal)) {
          toVal = `${toVal}T23:59:59.999`;
        }
        qb.andWhere(`${colRef} BETWEEN :${paramName}_from AND :${paramName}_to`, {
          [`${paramName}_from`]: fromVal,
          [`${paramName}_to`]: toVal,
        });
        break;
      }
    }
  } else if (Array.isArray(value)) {
    // Array overlap (PostgreSQL && operator for array columns)
    qb.andWhere(`${colRef} && ARRAY[:...${paramName}]`, { [paramName]: value });
  } else {
    qb.andWhere(`${colRef} = :${paramName}`, { [paramName]: value });
  }

  return paramIndex + 1;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * TypeORM version of listQuery.
 *
 * Provides filter operators, search (ILIKE), sort, and pagination
 * using TypeORM's QueryBuilder API.
 *
 * @example
 * ```ts
 * const qb = this.repo.createQueryBuilder('group');
 * const result = await typeormListQuery(qb, 'group', query, {
 *   sortableColumns: ['id', 'createdAt', 'name'],
 *   searchableColumns: ['name', 'description'],
 * });
 * ```
 */
export async function typeormListQuery<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  props: TypeormListQueryProps,
  options: TypeormListQueryOptions = {},
): Promise<Paging<T>> {
  const { sortableColumns = ['id'], searchableColumns = [] } = options;

  const { page = 1, limit = 25, filter = {}, sorts: sortsParam, search } = props;

  // -------------------------------------------------------------------------
  // Sort
  // -------------------------------------------------------------------------
  let sorts: string[];
  if (sortsParam) {
    const parsed = sortsParam.split(',').map((s) => s.trim());
    const invalidKeys = parsed.filter((item) => {
      const key = item.startsWith('-') ? item.substring(1) : item;
      return !sortableColumns.includes(key);
    });
    if (invalidKeys.length) {
      throw new BadRequestException(`Invalid sorts: ${invalidKeys.join(', ')}`);
    }
    sorts = parsed;
  } else {
    sorts = ['-createdAt'];
  }

  for (const s of sorts) {
    if (s.startsWith('-')) {
      qb.addOrderBy(`${alias}.${s.slice(1)}`, 'DESC');
    } else {
      qb.addOrderBy(`${alias}.${s}`, 'ASC');
    }
  }

  // -------------------------------------------------------------------------
  // Filter conditions
  // -------------------------------------------------------------------------
  let paramIndex = 0;
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null || value === '') continue;
    paramIndex = applyFilterCondition(qb, alias, key, value, paramIndex);
  }

  // -------------------------------------------------------------------------
  // Search (ILIKE across searchableColumns)
  // -------------------------------------------------------------------------
  if (search) {
    if (!searchableColumns.length) {
      throw new BadRequestException('searchableColumns is required when using search');
    }

    const searchConditions = searchableColumns.map((colName, idx) => {
      const paramName = `search_${idx}`;
      qb.setParameter(paramName, `%${search}%`);
      return `CAST(${alias}.${colName} AS text) ILIKE :${paramName}`;
    });

    qb.andWhere(`(${searchConditions.join(' OR ')})`);
  }

  // -------------------------------------------------------------------------
  // Execute: count + select
  // -------------------------------------------------------------------------
  const total = await qb.getCount();

  const items = await qb
    .skip((page - 1) * limit)
    .take(limit)
    .getMany();

  return {
    page: +page,
    limit: +limit,
    total,
    totalPages: Math.ceil(total / Number(limit)),
    items,
  };
}
