// Premium Dashboard View Models
// Presentation shapes bridged from the Worker API contracts in
// `src/lib/contracts/worker-http.ts` by the dashboard transforms; they are
// intentionally narrower than the raw API payloads and must not be treated as
// database schemas.

export interface CustomerHealth {
  overall_score: number; // 0-100
  engagement_score: number; // 0-100
  activation_score: number; // 0-100
  growth_score: number; // 0-100
  risk_score: number; // 0-100 (higher = worse)
  lifecycle_stage: LifecycleStage;
  predicted_churn_probability: number; // 0.0-1.0
  predicted_upgrade_probability: number;
  expansion_readiness_score: number;
  command_velocity_7d: number;
  command_velocity_trend: 'growing' | 'stable' | 'declining';
}

export type LifecycleStage =
  | 'new'
  | 'onboarding'
  | 'activated'
  | 'engaged'
  | 'power_user'
  | 'at_risk'
  | 'churning'
  | 'churned'
  | 'reactivated'
  | 'trial'
  | 'active';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface CustomerTag {
  id: string;
  name: string;
  color: string; // hex
  description?: string;
}

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
  success: number; // percentage
  failure: number;
}

export interface AdvancedMetrics {
  engagement: {
    dau: number;
    wau: number;
    mau: number;
    stickiness: {
      daily_to_monthly: string;
      daily_to_weekly: string;
    };
  };
  retention: {
    cohorts: Array<{
      cohort_date: string;
      week_number: number;
      retained_users: number;
      retention_rate: number;
    }>;
  };
  ltv_by_tier: Array<{
    tier: string;
    avg_ltv: number;
    customer_count: number;
  }>;
  feature_adoption: {
    install_adopters: number;
    search_adopters: number;
    runtime_adopters: number;
    total_users: number;
  };
  command_heatmap: Array<{
    hour: string;
    day_of_week: string;
    event_count: number;
  }>;
  runtime_adoption: Array<{
    runtime: string;
    unique_users: number;
    total_uses: number;
    growth_rate: number;
  }>;
  churn_risk_segments: Array<{
    risk_segment: 'low' | 'medium' | 'high' | 'critical';
    user_count: number;
    tier: string;
    avg_days_inactive: number;
  }>;
  expansion_opportunities: Array<{
    email: string;
    tier: string;
    opportunity_type: 'usage_based' | 'feature_gate' | 'team_growth' | 'enterprise';
    priority: Priority;
    potential_arr: number;
  }>;
  time_to_value: {
    avg_days_to_activation: number;
    pct_activated_week1: number;
    pct_activated_month1: number;
  };
  revenue_metrics: {
    current_mrr: number;
    projected_arr: number;
    expansion_mrr_12m: number;
    net_revenue_retention: number;
  };
}

export interface CRMCustomer {
  id: string;
  email: string;
  company?: string | undefined;
  tier: string;
  status: 'active' | 'suspended' | 'cancelled';
  health: CustomerHealth;
  tags: CustomerTag[];
  created_at: string;
  last_activity_at: string;
  total_commands: number;
  machine_count: number;
  mrr: number;
}
