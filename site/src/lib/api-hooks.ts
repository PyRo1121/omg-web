import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import * as api from './api';

/** Standard createQuery wrapper bound to an API loader and its static key parts. */
function apiQuery<T>(
  queryKey: ReadonlyArray<unknown>,
  queryFn: () => Promise<T>,
  options?: { enabled?: boolean; staleTime?: number; refetchInterval?: number }
) {
  return createQuery(() => ({ queryKey, queryFn, ...options }));
}

/**
 * Standard createMutation wrapper that invalidates the given query keys
 * (derived from the mutation variables) on success.
 */
function invalidatingMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  invalidatedKeys: (variables: TVariables) => ReadonlyArray<ReadonlyArray<unknown>>
) {
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn,
    onSuccess: (_data, variables) => {
      for (const queryKey of invalidatedKeys(variables)) {
        queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    },
  }));
}

// Reusable Query Hooks

export const useAdminDashboard = () => apiQuery(['admin-dashboard'], api.getAdminDashboard);

export const useAdminFirehose = (limit = 50, enabled: () => boolean = () => true) =>
  createQuery(() => ({
    queryKey: ['admin-firehose', limit],
    queryFn: () => api.getAdminFirehose(limit),
    enabled: enabled(),
    refetchInterval: enabled() ? 5000 : false,
  }));

export const useAdminRevenue = () => apiQuery(['admin-revenue'], api.getAdminRevenue);

// Mutations

// Accessor form keeps the query key reactive: changing page/filter refetches.
export const useAdminAuditLog = (
  page: () => number = () => 1,
  limit: () => number = () => 50,
  action: () => string = () => ''
) =>
  createQuery(() => ({
    queryKey: ['admin-audit-log', page(), limit(), action()],
    queryFn: () => api.getAdminAuditLog(page(), limit(), action()),
  }));

export const useAdminCohorts = () => apiQuery(['admin-cohorts'], api.getAdminCohorts);

export const useCreateNote = () =>
  invalidatingMutation(
    (params: { customerId: string; content: string; noteType?: string }) =>
      api.createAdminNote(params.customerId, params.content, params.noteType),
    params => [['admin-notes', params.customerId]]
  );

export const useDeleteNote = () =>
  invalidatingMutation(
    (params: { noteId: string; customerId: string }) => api.deleteAdminNote(params.noteId),
    params => [['admin-notes', params.customerId]]
  );

export const useAdminTags = () => apiQuery(['admin-tags'], api.getAdminTags);

export const useCreateTag = () =>
  invalidatingMutation(
    (params: { name: string; color?: string; description?: string }) =>
      api.createAdminTag(params.name, params.color, params.description),
    () => [['admin-tags']]
  );

export const useAssignTag = () =>
  invalidatingMutation(
    (params: { customerId: string; tagId: string }) =>
      api.assignAdminTag(params.customerId, params.tagId),
    params => [['admin-customer-tags', params.customerId], ['admin-tags']]
  );

export const useRemoveTag = () =>
  invalidatingMutation(
    (params: { customerId: string; tagId: string }) =>
      api.removeAdminTag(params.customerId, params.tagId),
    params => [['admin-customer-tags', params.customerId], ['admin-tags']]
  );

export const useAdminAdvancedMetrics = (enabled: () => boolean = () => true) =>
  createQuery(() => ({
    queryKey: ['admin-advanced-metrics'],
    queryFn: api.getAdminAdvancedMetrics,
    enabled: enabled(),
    staleTime: 300000,
  }));

export const useSiteRealtimeAnalytics = (enabled: () => boolean = () => true) =>
  createQuery(() => ({
    queryKey: ['site-realtime-analytics'],
    queryFn: api.getSiteRealtimeAnalytics,
    enabled: enabled(),
    refetchInterval: enabled() ? 10000 : false,
  }));
