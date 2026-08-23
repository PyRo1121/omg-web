import { describe, expect, it } from 'vitest';
import {
  CountRowSchema,
  UserRoleRowSchema,
  isInvalidD1Row,
  optionalD1RowValue,
  readD1RowArray,
  readOptionalD1Row,
} from './d1-rows';

describe('optional D1 rows', () => {
  it('distinguishes missing optional rows from malformed ones', async () => {
    const missing = await readOptionalD1Row(CountRowSchema, 'count', undefined);
    expect(missing._tag).toBe('missing');

    const present = await readOptionalD1Row(CountRowSchema, 'count', { count: 4 });
    expect(present).toEqual({ _tag: 'present', value: { count: 4 } });

    const fromNull = await readOptionalD1Row(CountRowSchema, 'count', { count: null });
    expect(fromNull).toEqual({ _tag: 'present', value: { count: 0 } });

    const invalid = await readOptionalD1Row(CountRowSchema, 'count', { count: 'nope' });
    expect(invalid._tag).toBe('invalid');
    expect(optionalD1RowValue(invalid)).toBeUndefined();
    expect(optionalD1RowValue(present)).toEqual({ count: 4 });
    expect(isInvalidD1Row(invalid)).toBe(true);
    expect(isInvalidD1Row(present)).toBe(false);
  });

  it('reads row lists, treating malformed rows as invalid instead of throwing', async () => {
    const ok = await readD1RowArray(UserRoleRowSchema, 'role', [{ role: 'admin' }]);
    expect(ok._tag).toBe('ok');

    const empty = await readD1RowArray(UserRoleRowSchema, 'role', undefined);
    expect(empty).toEqual({ _tag: 'ok', value: [] });

    const bad = await readD1RowArray(UserRoleRowSchema, 'role', [{ role: 'nope' }]);
    expect(bad._tag).toBe('invalid');
  });

  it('rejects role rows outside the user/admin literal union and malformed counts', async () => {
    const badRole = await readOptionalD1Row(UserRoleRowSchema, 'role', { role: 'nope' });
    expect(badRole._tag).toBe('invalid');

    const badCount = await readOptionalD1Row(CountRowSchema, 'count', { count: '4' });
    expect(badCount._tag).toBe('invalid');
  });
});
