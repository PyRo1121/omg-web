import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import * as api from './api';

type QueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
};

/** Standard createQuery wrapper bound to an API loader and its static key parts. */
function apiQuery<T>(
  queryKey: ReadonlyArray<unknown>,
  queryFn: () => Promise<T>,
  options?: QueryOptions
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
export const useTeamData = () => apiQuery(['team-data'], api.getTeamMembers);

export const useTeamPolicies = () => apiQuery(['team-policies'], api.getTeamPolicies);

export const useNotificationSettings = () =>
  apiQuery(['notification-settings'], api.getNotificationSettings);

export const useTeamAuditLogs = (params?: { limit?: number; offset?: number }) =>
  apiQuery(['team-audit-logs', params], () => api.getTeamAuditLogs(params));

export const useAdminEvents = () => apiQuery(['admin-events'], api.getAdminActivity);

export const useAdminDashboard = () => apiQuery(['admin-dashboard'], api.getAdminDashboard);

export const useAdminFirehose = (limit = 50) =>
  apiQuery(['admin-firehose', limit], () => api.getAdminFirehose(limit), {
    refetchInterval: 5000,
  });

// Mutations
export const useRevokeMachine = () =>
  invalidatingMutation(
    (machineId: string) => api.revokeMachine(machineId),
    () => [['team-data'], ['dashboard']]
  );

export const useAdminRevenue = () => apiQuery(['admin-revenue'], api.getAdminRevenue);

export const useAdminAnalytics = () => apiQuery(['admin-analytics'], api.getAdminAnalytics);

export const useAdminAuditLog = (page = 1, limit = 50, action = '') =>
  apiQuery(['admin-audit-log', page, limit, action], () =>
    api.getAdminAuditLog(page, limit, action)
  );

export const useAdminCRMUsers = (page = 1, limit = 50, search = '') =>
  apiQuery(['admin-crm-users', page, limit, search], () => api.getAdminUsers(page, limit, search));

export const useAdminUserDetail = (userId: string) =>
  apiQuery(['admin-user-detail', userId], () => api.getAdminUserDetail(userId), {
    enabled: Boolean(userId),
  });

export const useAdminCohorts = () => apiQuery(['admin-cohorts'], api.getAdminCohorts);

export const useAdminNotes = (customerId: string) =>
  apiQuery(['admin-notes', customerId], () => api.getAdminNotes(customerId), {
    enabled: Boolean(customerId),
  });

export const useCreateNote = () =>
  invalidatingMutation(
    (params: { customerId: string; content: string; noteType?: string }) =>
      api.createAdminNote(params.customerId, params.content, params.noteType),
    params => [['admin-notes', params.customerId]]
  );

export const useUpdateNote = () =>
  invalidatingMutation(
    (params: { noteId: string; customerId: string; content?: string; isPinned?: boolean }) =>
      api.updateAdminNote(params.noteId, { content: params.content, isPinned: params.isPinned }),
    params => [['admin-notes', params.customerId]]
  );

export const useDeleteNote = () =>
  invalidatingMutation(
    (params: { noteId: string; customerId: string }) => api.deleteAdminNote(params.noteId),
    params => [['admin-notes', params.customerId]]
  );

export const useAdminTags = () => apiQuery(['admin-tags'], api.getAdminTags);

export const useAdminCustomerTags = (customerId: string) =>
  apiQuery(['admin-customer-tags', customerId], () => api.getAdminCustomerTags(customerId), {
    enabled: Boolean(customerId),
  });

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

export const useAdminCustomerHealth = (customerId: string) =>
  apiQuery(['admin-customer-health', customerId], () => api.getAdminCustomerHealth(customerId), {
    enabled: Boolean(customerId),
  });

export const useAdminAdvancedMetrics = () =>
  apiQuery(['admin-advanced-metrics'], api.getAdminAdvancedMetrics, {
    staleTime: 5 * 60 * 1000,
  });

export const useSiteGeoAnalytics = (days = 30) =>
  apiQuery(['site-geo-analytics', days], () => api.getSiteGeoAnalytics(days), {
    staleTime: 60 * 1000,
  });

export const useSiteRealtimeAnalytics = () =>
  apiQuery(['site-realtime-analytics'], api.getSiteRealtimeAnalytics, {
    refetchInterval: 10000,
  });

export const useSiteAnalyticsOverview = (days = 30) =>
  apiQuery(['site-analytics-overview', days], () => api.getSiteAnalyticsOverview(days), {
    staleTime: 60 * 1000,
  });
