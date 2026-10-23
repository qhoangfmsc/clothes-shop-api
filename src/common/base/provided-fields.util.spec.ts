import { pickProvided } from './provided-fields.util';

describe('pickProvided', () => {
  it('drops undefined and null but keeps falsy values that were sent', () => {
    expect(pickProvided({ a: 0, b: '', c: false, d: undefined, e: null, f: [] })).toEqual({ a: 0, b: '', c: false, f: [] });
  });

  it('keeps null only for the fields declared nullable', () => {
    expect(
      pickProvided({ badge: null, name: null, note: undefined } as { badge?: string | null; name?: string | null; note?: string }, [
        'badge',
      ]),
    ).toEqual({
      badge: null,
    });
  });

  it('does not change the input', () => {
    const input = { a: 1, b: null };
    pickProvided(input);
    expect(input).toEqual({ a: 1, b: null });
  });
});
