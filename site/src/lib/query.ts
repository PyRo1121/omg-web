import { QueryClient } from '@tanstack/solid-query';
import { ApiError } from './api-error';

/**
 * Read an HTTP status from a query/mutation failure.
 *
 * @param error - TanStack Query's thrown error.
 * @returns The status when the error is a classified `ApiError`.
 */
export function queryErrorStatus(error: Error): number | undefined {
  return error instanceof ApiError ? error.status : undefined;
}

/**
 * Whether a query failure should surface as an unhandled error.
 *
 * @param error - TanStack Query's thrown error.
 * @returns True for 5xx responses.
 */
export function isServerQueryError(error: Error): boolean {
  const status = queryErrorStatus(error);
  return status !== undefined && status >= 500;
}

/**
 * Whether a mutation should be retried.
 *
 * @param failureCount - Attempts already made.
 * @param error - TanStack Query's thrown error.
 * @returns False for 4xx responses; otherwise up to two retries.
 */
export function shouldRetryMutation(failureCount: number, error: Error): boolean {
  const status = queryErrorStatus(error);
  if (status !== undefined && status < 500) {
    return false;
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      networkMode: 'offlineFirst',
      throwOnError: isServerQueryError,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: shouldRetryMutation,
      throwOnError: isServerQueryError,
    },
  },
});
