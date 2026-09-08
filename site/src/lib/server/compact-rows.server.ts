import { normalizedOptionalText } from './optional-text.server';

export function compactLabelRows<T extends object, P>(
  rows: ReadonlyArray<T>,
  labelOf: (row: T) => string | null,
  project: (row: T, label: string) => P
): ReadonlyArray<P> {
  const result: Array<P> = [];
  for (const row of rows) {
    const label = normalizedOptionalText(labelOf(row));
    if (label !== null) result.push(project(row, label));
  }
  return result;
}
