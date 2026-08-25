export type DateRange = '7d' | '30d' | '90d';

export type AdminTab = 'overview' | 'crm' | 'analytics' | 'insights' | 'revenue' | 'audit';

export interface SavedView {
  id: string;
  name: string;
  tab: AdminTab;
  dateRange: DateRange;
}
