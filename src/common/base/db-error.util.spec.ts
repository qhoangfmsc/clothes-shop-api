import { AppException } from '@common/exceptions/app.exception';
import { dbError, isUniqueViolation, PG_CHECK_VIOLATION, PG_UNIQUE_VIOLATION, throwOnConstraint } from './db-error.util';

const wrapped = (code: string, constraint?: string, column?: string) => ({
  message: 'query failed',
  driverError: { code, constraint, column },
});

describe('dbError', () => {
  it('reads the code, constraint and column from a TypeORM-wrapped pg error or from a bare pg error', () => {
    expect(dbError(wrapped('23505', 'UQ_x'))).toEqual({ code: '23505', constraint: 'UQ_x', column: undefined });
    expect(dbError({ code: '23502', column: 'name' })).toEqual({ code: '23502', constraint: undefined, column: 'name' });
  });

  it('returns null for anything that is not a database error', () => {
    for (const value of [null, undefined, new Error('boom'), { code: 'ECONNRESET' }, { code: 23505 }, 'text'])
      expect(dbError(value)).toBeNull();
  });
});

describe('isUniqueViolation', () => {
  it('matches the code, and the constraint when given', () => {
    expect(isUniqueViolation(wrapped(PG_UNIQUE_VIOLATION, 'UQ_a'))).toBe(true);
    expect(isUniqueViolation(wrapped(PG_UNIQUE_VIOLATION, 'UQ_a'), 'UQ_a')).toBe(true);
    expect(isUniqueViolation(wrapped(PG_UNIQUE_VIOLATION, 'UQ_a'), 'UQ_b')).toBe(false);
    expect(isUniqueViolation(wrapped(PG_CHECK_VIOLATION, 'UQ_a'))).toBe(false);
  });
});

describe('throwOnConstraint', () => {
  it('throws the mapped app error for a mapped unique or check constraint', () => {
    expect(() => throwOnConstraint(wrapped('23505', 'UQ_a'), { UQ_a: 1002 })).toThrow(AppException);
    try {
      throwOnConstraint(wrapped('23514', 'CK_q'), { CK_q: 2004 });
    } catch (error) {
      expect((error as AppException).getResponse()).toMatchObject({ errorCode: 2004, statusCode: 400 });
    }
  });

  it('does nothing for an unmapped constraint, another SQLSTATE or a non-database error', () => {
    expect(() => throwOnConstraint(wrapped('23505', 'UQ_other'), { UQ_a: 1002 })).not.toThrow();
    expect(() => throwOnConstraint(wrapped('23502', 'UQ_a'), { UQ_a: 1002 })).not.toThrow();
    expect(() => throwOnConstraint(new Error('x'), { UQ_a: 1002 })).not.toThrow();
  });
});
