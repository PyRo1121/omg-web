import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class values while resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Exhaustiveness helper for tagged unions. Passing a remaining value is a
 * compile-time error; reaching this at runtime is a defect.
 *
 * @param unexpectedCase - A value the compiler proves cannot exist.
 * @returns Never returns.
 */
export function casesHandled(unexpectedCase: never): never {
  throw new Error(`Unhandled case: ${String(unexpectedCase)}`);
}
