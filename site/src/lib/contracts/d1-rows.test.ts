import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  CountRowSchema,
  LicenseRowSchema,
  MachineRowSchema,
  UserRoleRowSchema,
  decodeD1Row,
  decodeOptionalD1Row,
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
  });

  it('returns undefined for a missing get() row', async () => {
    const row = await Effect.runPromise(decodeOptionalD1Row(CountRowSchema, 'count', null));
    expect(row).toBeUndefined();
  });
});

describe('D1 row lists', () => {
  it('decodes a list of machine rows', async () => {
    const decoded = await readD1RowArray(MachineRowSchema, 'machines', [
      {
        id: 'm1',
        machineId: 'host-1',
        isActive: 1,
        lastSeenAt: new Date('2026-08-18T00:00:00.000Z'),
        hostname: null,
      },
    ]);
    expect(decoded._tag).toBe('ok');
    if (decoded._tag === 'ok') {
      expect(decoded.value[0]?.machineId).toBe('host-1');
      expect(decoded.value[0]?.isActive).toBe(true);
    }
  });

  it('rejects a non-array results value', async () => {
    const decoded = await readD1RowArray(MachineRowSchema, 'machines', { nope: true });
    expect(decoded._tag).toBe('invalid');
  });

  it('rejects a list that contains a malformed row', async () => {
    const decoded = await readD1RowArray(MachineRowSchema, 'machines', [
      { id: 'm1', machineId: 'host-1', isActive: true, lastSeenAt: new Date() },
      { id: 1 },
    ]);
    expect(decoded._tag).toBe('invalid');
  });
});

describe('license and role rows', () => {
  it('decodes a license row and timestamp number', async () => {
    const row = await Effect.runPromise(
      decodeD1Row(LicenseRowSchema, 'license', {
        id: 'lic_1',
        userId: 'u1',
        licenseKey: 'key',
        tier: 'team',
        status: 'active',
        maxMachines: 25,
        expiresAt: 1_700_000_000_000,
      })
    );
    expect(row.tier).toBe('team');
    expect(row.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects an unknown admin role', async () => {
    const exit = await Effect.runPromiseExit(
      decodeD1Row(UserRoleRowSchema, 'role', { role: 'superadmin' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
