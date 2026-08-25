// Premium Dashboard View Models
// Presentation shapes bridged from the Worker API contracts in
// `src/lib/contracts/worker-http.ts` by the dashboard transforms; they are
// intentionally narrower than the raw API payloads and must not be treated as
// database schemas.

export interface FirehoseEvent {
  id: string;
  event_type: 'command' | 'install' | 'search' | 'runtime_switch' | 'error';
  event_name: string;
  machine_id: string;
  hostname: string;
  platform: string;
  timestamp: string | undefined;
  duration_ms: number | undefined;
  success: boolean | undefined;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface GeoDistribution {
  country: string;
  country_code: string;
  count: number;
  percentage: number;
}

export interface CommandHealth {
  success: number | null;
  failure: number | null;
}

export interface CRMCustomer {
  id: string;
  email: string;
  company?: string | undefined;
  tier: string;
  status: string;
  engagement_score: number;
  created_at: string;
  total_commands: number;
  machine_count: number;
}
