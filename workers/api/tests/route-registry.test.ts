import { describe, expect, it } from 'vitest';
import workerSource from '../src/worker.ts?raw';
import { LicensingRoutes, resolveLicensingRoute } from '../../../shared/licensing-routes';

/** Dispatch paths handled by the worker switch (`case '<path>':` literals). */
const dispatchedPaths = new Set<string>(
  [...workerSource.matchAll(/case '([^']+)':/g)].flatMap(match =>
    match[1] !== undefined && match[1].startsWith('/') ? [match[1]] : []
  )
);

const registryPaths = new Set<string>(Object.values(LicensingRoutes).map(route => route.path));

describe('licensing route registry ↔ worker dispatch parity', () => {
  it('dispatches every registry path', () => {
    const missing = [...registryPaths].filter(path => !dispatchedPaths.has(path));
    expect(missing).toEqual([]);
  });

  it('has no unreachable dispatch cases behind the registry 404 gate', () => {
    const extra = [...dispatchedPaths].filter(path => !registryPaths.has(path));
    expect(extra).toEqual([]);
  });

  it('resolves every registered method/path pair', () => {
    for (const route of Object.values(LicensingRoutes)) {
      expect(resolveLicensingRoute(route.method, route.path)).toBe(route);
    }
  });
});
