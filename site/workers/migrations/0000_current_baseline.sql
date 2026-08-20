-- Canonical OMG licensing schema baseline through legacy migration 010.
--
-- New databases apply this baseline before migrations 011 and later.
-- Existing databases must be inventoried through `wrangler d1 migrations list` and
-- schema inspection before this baseline is recorded. Every statement is
-- idempotent for a database already migrated through legacy migration 010.

PRAGMA foreign_keys = ON;

-- table: achievements
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, achievement_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: admin_alerts
CREATE TABLE IF NOT EXISTS admin_alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'churn_risk', 'expansion_opportunity', 'failed_payment',
    'high_value_signup', 'usage_spike', 'usage_drop', 'github_integration',
    'security', 'system'
  )),
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  customer_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  action_url TEXT,
  is_read INTEGER DEFAULT 0,
  is_resolved INTEGER DEFAULT 0,
  resolved_at DATETIME,
  resolved_by TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- table: alert_thresholds
CREATE TABLE IF NOT EXISTS alert_thresholds (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  threshold_type TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(license_id, threshold_type),
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

-- table: analytics_active_users
CREATE TABLE IF NOT EXISTS analytics_active_users (
  date TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  PRIMARY KEY (date, machine_id)
);

-- table: analytics_daily
CREATE TABLE IF NOT EXISTS analytics_daily (
  date TEXT NOT NULL,
  metric TEXT NOT NULL,
  dimension TEXT NOT NULL,
  value INTEGER DEFAULT 0,
  PRIMARY KEY (date, metric, dimension)
);

-- table: analytics_errors
CREATE TABLE IF NOT EXISTS analytics_errors (
  error_message TEXT PRIMARY KEY,
  occurrences INTEGER DEFAULT 0,
  last_occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: analytics_events
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  properties TEXT,
  timestamp TEXT NOT NULL,
  session_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  license_key TEXT,
  version TEXT,
  platform TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: analytics_packages
CREATE TABLE IF NOT EXISTS analytics_packages (
  package_name TEXT PRIMARY KEY,
  install_count INTEGER DEFAULT 0,
  search_count INTEGER DEFAULT 0,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: analytics_performance
CREATE TABLE IF NOT EXISTS analytics_performance (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: analytics_regional_perf
CREATE TABLE IF NOT EXISTS analytics_regional_perf (
  region TEXT NOT NULL,
  operation TEXT NOT NULL,
  avg_duration_ms INTEGER NOT NULL,
  count INTEGER DEFAULT 1,
  PRIMARY KEY (region, operation)
);

-- table: analytics_salts
CREATE TABLE IF NOT EXISTS analytics_salts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salt BLOB NOT NULL,
  inserted_at INTEGER DEFAULT (unixepoch() * 1000)
);

-- table: audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- table: auth_codes
CREATE TABLE IF NOT EXISTS auth_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: crm_tasks
CREATE TABLE IF NOT EXISTS crm_tasks (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  assigned_to TEXT,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'followup' CHECK (task_type IN (
    'followup', 'onboarding', 'renewal', 'upsell', 'support', 'custom'
  )),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- table: customer_communications
CREATE TABLE IF NOT EXISTS customer_communications (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'chat', 'phone', 'meeting', 'support_ticket')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject TEXT,
  summary TEXT,
  external_id TEXT,
  metadata TEXT,
  occurred_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  recorded_by TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: customer_health
CREATE TABLE IF NOT EXISTS customer_health (
  id TEXT PRIMARY KEY,
  customer_id TEXT UNIQUE NOT NULL,

  overall_score INTEGER DEFAULT 50,
  engagement_score INTEGER DEFAULT 50,
  activation_score INTEGER DEFAULT 50,
  growth_score INTEGER DEFAULT 50,
  risk_score INTEGER DEFAULT 0,

  lifecycle_stage TEXT DEFAULT 'new' CHECK (lifecycle_stage IN (
    'new', 'onboarding', 'activated', 'engaged', 'power_user',
    'at_risk', 'churning', 'churned', 'reactivated'
  )),

  predicted_churn_probability REAL DEFAULT 0.0,
  predicted_upgrade_probability REAL DEFAULT 0.0,
  expansion_readiness_score INTEGER DEFAULT 0,

  first_value_date DATETIME,
  activation_date DATETIME,
  power_user_date DATETIME,
  last_healthy_activity DATETIME,
  churn_risk_flagged_at DATETIME,

  days_to_activation INTEGER,
  days_since_last_activity INTEGER,
  command_velocity_7d REAL DEFAULT 0.0,
  command_velocity_trend TEXT DEFAULT 'stable',

  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: customer_notes
CREATE TABLE IF NOT EXISTS customer_notes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  note_type TEXT DEFAULT 'general' CHECK (note_type IN (
    'general', 'call', 'email', 'meeting', 'support', 'sales', 'success'
  )),
  content TEXT NOT NULL,
  is_pinned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- table: customer_revenue
CREATE TABLE IF NOT EXISTS customer_revenue (
  id TEXT PRIMARY KEY,
  customer_id TEXT UNIQUE NOT NULL,

  ltv_total_cents INTEGER DEFAULT 0,
  ltv_currency TEXT DEFAULT 'usd',
  total_payments INTEGER DEFAULT 0,
  total_refunds_cents INTEGER DEFAULT 0,
  first_payment_at DATETIME,
  last_payment_at DATETIME,

  current_mrr_cents INTEGER DEFAULT 0,
  current_plan_price_id TEXT,

  expansion_mrr_cents INTEGER DEFAULT 0,
  contraction_mrr_cents INTEGER DEFAULT 0,

  failed_payments_30d INTEGER DEFAULT 0,
  dunning_attempts INTEGER DEFAULT 0,
  last_failed_payment_at DATETIME,

  seats_utilization_pct REAL DEFAULT 0.0,
  feature_limit_hits_30d INTEGER DEFAULT 0,

  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: customer_segments
CREATE TABLE IF NOT EXISTS customer_segments (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  filter_rules TEXT NOT NULL,
  is_dynamic INTEGER DEFAULT 1,
  member_count INTEGER DEFAULT 0,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: customer_tag_assignments
CREATE TABLE IF NOT EXISTS customer_tag_assignments (
  customer_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  assigned_by TEXT,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, tag_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES customer_tags(id) ON DELETE CASCADE
);

-- table: customer_tags
CREATE TABLE IF NOT EXISTS customer_tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#6366f1',
  description TEXT,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  email TEXT NOT NULL,
  company TEXT,
  tier TEXT DEFAULT 'free',
  admin INTEGER DEFAULT 0,
  telemetry_opt_out INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: docs_analytics_events
CREATE TABLE IF NOT EXISTS docs_analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('pageview', 'interaction', 'navigation', 'performance')),
  event_name TEXT NOT NULL,
  properties TEXT NOT NULL,  -- JSON blob: url, referrer, utm_*, viewport, etc.
  timestamp TEXT NOT NULL,   -- ISO 8601
  session_id TEXT NOT NULL,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: docs_analytics_geo_daily
CREATE TABLE IF NOT EXISTS docs_analytics_geo_daily (
  date TEXT NOT NULL,
  country_code TEXT NOT NULL,
  sessions INTEGER DEFAULT 0,
  pageviews INTEGER DEFAULT 0,
  PRIMARY KEY (date, country_code)
);

-- table: docs_analytics_interactions_daily
CREATE TABLE IF NOT EXISTS docs_analytics_interactions_daily (
  date TEXT NOT NULL,
  interaction_type TEXT NOT NULL,  -- click, copy, scroll
  target TEXT NOT NULL,             -- button_id, code_block, etc.
  count INTEGER DEFAULT 0,
  PRIMARY KEY (date, interaction_type, target)
);

-- table: docs_analytics_pageviews_daily
CREATE TABLE IF NOT EXISTS docs_analytics_pageviews_daily (
  date TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  unique_sessions INTEGER DEFAULT 0,
  avg_time_on_page_ms INTEGER DEFAULT 0,
  bounce_rate REAL DEFAULT 0.0,
  PRIMARY KEY (date, path)
);

-- table: docs_analytics_performance_daily
CREATE TABLE IF NOT EXISTS docs_analytics_performance_daily (
  date TEXT NOT NULL,
  path TEXT NOT NULL,
  avg_load_time_ms INTEGER DEFAULT 0,
  p50_load_time_ms INTEGER DEFAULT 0,
  p95_load_time_ms INTEGER DEFAULT 0,
  p99_load_time_ms INTEGER DEFAULT 0,
  sample_count INTEGER DEFAULT 0,
  PRIMARY KEY (date, path)
);

-- table: docs_analytics_referrers_daily
CREATE TABLE IF NOT EXISTS docs_analytics_referrers_daily (
  date TEXT NOT NULL,
  referrer TEXT NOT NULL,
  sessions INTEGER DEFAULT 0,
  pageviews INTEGER DEFAULT 0,
  PRIMARY KEY (date, referrer)
);

-- table: docs_analytics_sessions
CREATE TABLE IF NOT EXISTS docs_analytics_sessions (
  session_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  page_count INTEGER DEFAULT 1,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  entry_page TEXT,
  exit_page TEXT,
  total_time_ms INTEGER DEFAULT 0
);

-- table: docs_analytics_utm_daily
CREATE TABLE IF NOT EXISTS docs_analytics_utm_daily (
  date TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  sessions INTEGER DEFAULT 0,
  pageviews INTEGER DEFAULT 0,
  PRIMARY KEY (date, utm_source, utm_medium, utm_campaign)
);

-- table: github_activity
CREATE TABLE IF NOT EXISTS github_activity (
  id TEXT PRIMARY KEY,
  github_connection_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'push', 'pull_request', 'issue', 'release', 'workflow_run',
    'star', 'fork', 'commit'
  )),
  repo_full_name TEXT,
  activity_data TEXT,
  activity_timestamp DATETIME,
  omg_related INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (github_connection_id) REFERENCES github_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: github_connections
CREATE TABLE IF NOT EXISTS github_connections (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  github_user_id INTEGER NOT NULL,
  github_username TEXT NOT NULL,
  github_access_token TEXT,
  github_avatar_url TEXT,
  scopes TEXT,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_synced_at DATETIME,
  sync_status TEXT DEFAULT 'active' CHECK (sync_status IN ('active', 'expired', 'revoked')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: github_repos
CREATE TABLE IF NOT EXISTS github_repos (
  id TEXT PRIMARY KEY,
  github_connection_id TEXT NOT NULL,
  github_repo_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  is_private INTEGER DEFAULT 0,
  primary_language TEXT,
  stars INTEGER DEFAULT 0,
  forks INTEGER DEFAULT 0,
  open_issues INTEGER DEFAULT 0,
  last_push_at DATETIME,
  created_at DATETIME,
  omg_detected INTEGER DEFAULT 0,
  omg_config_path TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (github_connection_id) REFERENCES github_connections(id) ON DELETE CASCADE
);

-- table: install_stats
CREATE TABLE IF NOT EXISTS install_stats (
  id TEXT PRIMARY KEY,
  install_id TEXT UNIQUE NOT NULL,
  version TEXT,
  platform TEXT,
  backend TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: invoices
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  stripe_invoice_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT,
  invoice_url TEXT,
  invoice_pdf TEXT,
  period_start DATETIME,
  period_end DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: licenses
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  license_key TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT DEFAULT 'active',
  max_seats INTEGER,
  used_seats INTEGER DEFAULT 0,
  max_machines INTEGER DEFAULT 1,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: machines
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  hostname TEXT,
  os TEXT,
  arch TEXT,
  omg_version TEXT,
  user_name TEXT,
  user_email TEXT,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1,
  revoked_at DATETIME,
  UNIQUE(license_id, machine_id),
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

-- table: notification_settings
CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  type TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  threshold INTEGER,
  channels TEXT DEFAULT '["dashboard"]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(license_id, type),
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

-- table: policies
CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('runtime', 'package', 'security', 'network')),
  rule TEXT NOT NULL,
  value TEXT NOT NULL,
  enforced INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(license_id, scope, rule),
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

-- table: scheduled_reports
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  schedule TEXT NOT NULL,
  recipients TEXT NOT NULL,
  filters TEXT,
  format TEXT DEFAULT 'csv',
  is_active INTEGER DEFAULT 1,
  last_run_at DATETIME,
  next_run_at DATETIME,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: segment_memberships
CREATE TABLE IF NOT EXISTS segment_memberships (
  segment_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (segment_id, customer_id),
  FOREIGN KEY (segment_id) REFERENCES customer_segments(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: site_analytics_devices_daily
CREATE TABLE IF NOT EXISTS site_analytics_devices_daily (
  date TEXT NOT NULL,
  device_type TEXT NOT NULL,  -- desktop, mobile, tablet
  browser TEXT NOT NULL,
  os TEXT NOT NULL,
  visitors INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  PRIMARY KEY (date, device_type, browser, os)
);

-- table: site_analytics_events
CREATE TABLE IF NOT EXISTS site_analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('pageview', 'click', 'form', 'error', 'performance')),
  event_name TEXT NOT NULL,
  properties TEXT NOT NULL,  -- JSON: url, referrer, utm_*, viewport, etc.
  timestamp INTEGER NOT NULL, -- Unix ms for optimal D1 performance
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,   -- Privacy-preserving hash (rotated daily)
  country_code TEXT,          -- From CF-IPCountry
  city TEXT,                  -- From CF-City (optional)
  duration_ms INTEGER,
  created_at INTEGER DEFAULT (unixepoch() * 1000)
);

-- table: site_analytics_geo_daily
CREATE TABLE IF NOT EXISTS site_analytics_geo_daily (
  date TEXT NOT NULL,
  country_code TEXT NOT NULL,
  city TEXT DEFAULT 'Unknown',
  visitors INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  pageviews INTEGER DEFAULT 0,
  PRIMARY KEY (date, country_code, city)
);

-- table: site_analytics_hourly
CREATE TABLE IF NOT EXISTS site_analytics_hourly (
  date TEXT NOT NULL,
  hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  visitors INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  pageviews INTEGER DEFAULT 0,
  PRIMARY KEY (date, hour)
);

-- table: site_analytics_pageviews_daily
CREATE TABLE IF NOT EXISTS site_analytics_pageviews_daily (
  date TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  unique_sessions INTEGER DEFAULT 0,
  avg_time_on_page_ms INTEGER DEFAULT 0,
  bounce_count INTEGER DEFAULT 0,
  entry_count INTEGER DEFAULT 0,
  exit_count INTEGER DEFAULT 0,
  PRIMARY KEY (date, path)
);

-- table: site_analytics_realtime
CREATE TABLE IF NOT EXISTS site_analytics_realtime (
  visitor_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  page_path TEXT NOT NULL,
  country_code TEXT,
  city TEXT,
  referrer TEXT,
  last_seen_at INTEGER NOT NULL,  -- Unix ms
  page_count INTEGER DEFAULT 1
);

-- table: site_analytics_referrers_daily
CREATE TABLE IF NOT EXISTS site_analytics_referrers_daily (
  date TEXT NOT NULL,
  referrer_domain TEXT NOT NULL,
  referrer_path TEXT,
  visitors INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  pageviews INTEGER DEFAULT 0,
  PRIMARY KEY (date, referrer_domain)
);

-- table: site_analytics_utm_daily
CREATE TABLE IF NOT EXISTS site_analytics_utm_daily (
  date TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  visitors INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  PRIMARY KEY (date, utm_source, utm_medium, utm_campaign)
);

-- table: stripe_events
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  customer_id TEXT,
  stripe_customer_id TEXT,
  event_data TEXT,
  processed INTEGER DEFAULT 0,
  processed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- table: subscription_changes
CREATE TABLE IF NOT EXISTS subscription_changes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  subscription_id TEXT,
  change_type TEXT NOT NULL CHECK (change_type IN ('upgrade', 'downgrade', 'cancel', 'reactivate', 'renewal')),
  old_tier TEXT,
  new_tier TEXT,
  old_price_cents INTEGER,
  new_price_cents INTEGER,
  reason TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT DEFAULT 'active',
  current_period_start DATETIME,
  current_period_end DATETIME,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- table: team_compliance
CREATE TABLE IF NOT EXISTS team_compliance (
  license_id TEXT PRIMARY KEY,
  enforce_signed_packages INTEGER DEFAULT 0,
  min_omg_version TEXT,
  allowed_runtimes TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

-- table: usage
CREATE TABLE IF NOT EXISTS usage (
  id TEXT PRIMARY KEY,
  license_key TEXT NOT NULL,
  feature TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  machine_id TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- table: usage_daily
CREATE TABLE IF NOT EXISTS usage_daily (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  date TEXT NOT NULL,
  commands_run INTEGER DEFAULT 0,
  packages_installed INTEGER DEFAULT 0,
  packages_searched INTEGER DEFAULT 0,
  runtimes_switched INTEGER DEFAULT 0,
  sbom_generated INTEGER DEFAULT 0,
  vulnerabilities_found INTEGER DEFAULT 0,
  time_saved_ms INTEGER DEFAULT 0,
  UNIQUE(license_id, date),
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

-- table: usage_member_daily
CREATE TABLE IF NOT EXISTS usage_member_daily (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  date TEXT NOT NULL,
  commands_run INTEGER DEFAULT 0,
  packages_installed INTEGER DEFAULT 0,
  runtimes_switched INTEGER DEFAULT 0,
  time_saved_ms INTEGER DEFAULT 0,
  UNIQUE(license_id, machine_id, date),
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

-- table: webhook_dlq
CREATE TABLE IF NOT EXISTS webhook_dlq (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  webhook_type TEXT NOT NULL,
  error_message TEXT,
  raw_payload TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- index: idx_achievements_customer
CREATE INDEX IF NOT EXISTS idx_achievements_customer ON achievements(customer_id);

-- index: idx_admin_alerts_customer
CREATE INDEX IF NOT EXISTS idx_admin_alerts_customer ON admin_alerts(customer_id);

-- index: idx_admin_alerts_severity
CREATE INDEX IF NOT EXISTS idx_admin_alerts_severity ON admin_alerts(severity);

-- index: idx_admin_alerts_type
CREATE INDEX IF NOT EXISTS idx_admin_alerts_type ON admin_alerts(alert_type);

-- index: idx_admin_alerts_unread
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unread ON admin_alerts(is_read) WHERE is_read = 0;

-- index: idx_admin_alerts_unresolved
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unresolved ON admin_alerts(is_resolved) WHERE is_resolved = 0;

-- index: idx_alert_thresholds_license
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_license ON alert_thresholds(license_id);

-- index: idx_analytics_daily_date
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date);

-- index: idx_analytics_daily_metric
CREATE INDEX IF NOT EXISTS idx_analytics_daily_metric ON analytics_daily(metric);

-- index: idx_analytics_events_created
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);

-- index: idx_analytics_events_machine
CREATE INDEX IF NOT EXISTS idx_analytics_events_machine ON analytics_events(machine_id);

-- index: idx_analytics_events_session
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);

-- index: idx_analytics_events_type
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);

-- index: idx_analytics_performance_created
CREATE INDEX IF NOT EXISTS idx_analytics_performance_created ON analytics_performance(created_at);

-- index: idx_analytics_performance_op
CREATE INDEX IF NOT EXISTS idx_analytics_performance_op ON analytics_performance(operation);

-- index: idx_audit_action
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- index: idx_audit_created
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- index: idx_audit_customer
CREATE INDEX IF NOT EXISTS idx_audit_customer ON audit_log(customer_id);

-- index: idx_auth_codes_email
CREATE INDEX IF NOT EXISTS idx_auth_codes_email ON auth_codes(email);

-- index: idx_comms_channel
CREATE INDEX IF NOT EXISTS idx_comms_channel ON customer_communications(channel);

-- index: idx_comms_customer
CREATE INDEX IF NOT EXISTS idx_comms_customer ON customer_communications(customer_id);

-- index: idx_comms_occurred
CREATE INDEX IF NOT EXISTS idx_comms_occurred ON customer_communications(occurred_at DESC);

-- index: idx_crm_tasks_assigned
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned ON crm_tasks(assigned_to);

-- index: idx_crm_tasks_customer
CREATE INDEX IF NOT EXISTS idx_crm_tasks_customer ON crm_tasks(customer_id);

-- index: idx_crm_tasks_due
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due ON crm_tasks(due_date);

-- index: idx_crm_tasks_priority
CREATE INDEX IF NOT EXISTS idx_crm_tasks_priority ON crm_tasks(priority, status);

-- index: idx_crm_tasks_status
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status);

-- index: idx_customer_health_churn
CREATE INDEX IF NOT EXISTS idx_customer_health_churn ON customer_health(predicted_churn_probability);

-- index: idx_customer_health_customer
CREATE INDEX IF NOT EXISTS idx_customer_health_customer ON customer_health(customer_id);

-- index: idx_customer_health_lifecycle
CREATE INDEX IF NOT EXISTS idx_customer_health_lifecycle ON customer_health(lifecycle_stage);

-- index: idx_customer_health_score
CREATE INDEX IF NOT EXISTS idx_customer_health_score ON customer_health(overall_score);

-- index: idx_customer_revenue_customer
CREATE INDEX IF NOT EXISTS idx_customer_revenue_customer ON customer_revenue(customer_id);

-- index: idx_customer_revenue_ltv
CREATE INDEX IF NOT EXISTS idx_customer_revenue_ltv ON customer_revenue(ltv_total_cents);

-- index: idx_customer_revenue_mrr
CREATE INDEX IF NOT EXISTS idx_customer_revenue_mrr ON customer_revenue(current_mrr_cents);

-- index: idx_customers_admin
CREATE INDEX IF NOT EXISTS idx_customers_admin ON customers(admin);

-- index: idx_customers_email
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- index: idx_customers_stripe
CREATE INDEX IF NOT EXISTS idx_customers_stripe ON customers(stripe_customer_id);

-- index: idx_docs_events_created
CREATE INDEX IF NOT EXISTS idx_docs_events_created ON docs_analytics_events(created_at);

-- index: idx_docs_events_name
CREATE INDEX IF NOT EXISTS idx_docs_events_name ON docs_analytics_events(event_name);

-- index: idx_docs_events_session
CREATE INDEX IF NOT EXISTS idx_docs_events_session ON docs_analytics_events(session_id);

-- index: idx_docs_events_type
CREATE INDEX IF NOT EXISTS idx_docs_events_type ON docs_analytics_events(event_type);

-- index: idx_docs_geo_date
CREATE INDEX IF NOT EXISTS idx_docs_geo_date ON docs_analytics_geo_daily(date);

-- index: idx_docs_interactions_date
CREATE INDEX IF NOT EXISTS idx_docs_interactions_date ON docs_analytics_interactions_daily(date);

-- index: idx_docs_pageviews_date
CREATE INDEX IF NOT EXISTS idx_docs_pageviews_date ON docs_analytics_pageviews_daily(date);

-- index: idx_docs_pageviews_path
CREATE INDEX IF NOT EXISTS idx_docs_pageviews_path ON docs_analytics_pageviews_daily(path);

-- index: idx_docs_performance_date
CREATE INDEX IF NOT EXISTS idx_docs_performance_date ON docs_analytics_performance_daily(date);

-- index: idx_docs_referrers_date
CREATE INDEX IF NOT EXISTS idx_docs_referrers_date ON docs_analytics_referrers_daily(date);

-- index: idx_docs_sessions_first_seen
CREATE INDEX IF NOT EXISTS idx_docs_sessions_first_seen ON docs_analytics_sessions(first_seen_at);

-- index: idx_docs_utm_date
CREATE INDEX IF NOT EXISTS idx_docs_utm_date ON docs_analytics_utm_daily(date);

-- index: idx_github_activity_connection
CREATE INDEX IF NOT EXISTS idx_github_activity_connection ON github_activity(github_connection_id);

-- index: idx_github_activity_customer
CREATE INDEX IF NOT EXISTS idx_github_activity_customer ON github_activity(customer_id);

-- index: idx_github_activity_omg
CREATE INDEX IF NOT EXISTS idx_github_activity_omg ON github_activity(omg_related);

-- index: idx_github_activity_timestamp
CREATE INDEX IF NOT EXISTS idx_github_activity_timestamp ON github_activity(activity_timestamp);

-- index: idx_github_activity_type
CREATE INDEX IF NOT EXISTS idx_github_activity_type ON github_activity(activity_type);

-- index: idx_github_customer
CREATE INDEX IF NOT EXISTS idx_github_customer ON github_connections(customer_id);

-- index: idx_github_status
CREATE INDEX IF NOT EXISTS idx_github_status ON github_connections(sync_status);

-- index: idx_github_username
CREATE INDEX IF NOT EXISTS idx_github_username ON github_connections(github_username);

-- index: idx_install_stats_created
CREATE INDEX IF NOT EXISTS idx_install_stats_created ON install_stats(created_at);

-- index: idx_install_stats_install_id
CREATE INDEX IF NOT EXISTS idx_install_stats_install_id ON install_stats(install_id);

-- index: idx_invoices_customer
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);

-- index: idx_licenses_customer
CREATE INDEX IF NOT EXISTS idx_licenses_customer ON licenses(customer_id);

-- index: idx_licenses_key
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);

-- index: idx_machines_active
CREATE INDEX IF NOT EXISTS idx_machines_active ON machines(is_active);

-- index: idx_machines_license
CREATE INDEX IF NOT EXISTS idx_machines_license ON machines(license_id);

-- index: idx_notes_author
CREATE INDEX IF NOT EXISTS idx_notes_author ON customer_notes(author_id);

-- index: idx_notes_created
CREATE INDEX IF NOT EXISTS idx_notes_created ON customer_notes(created_at DESC);

-- index: idx_notes_customer
CREATE INDEX IF NOT EXISTS idx_notes_customer ON customer_notes(customer_id);

-- index: idx_notes_pinned
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON customer_notes(customer_id, is_pinned DESC);

-- index: idx_notification_settings_license
CREATE INDEX IF NOT EXISTS idx_notification_settings_license ON notification_settings(license_id);

-- index: idx_policies_license
CREATE INDEX IF NOT EXISTS idx_policies_license ON policies(license_id);

-- index: idx_policies_scope
CREATE INDEX IF NOT EXISTS idx_policies_scope ON policies(license_id, scope);

-- index: idx_repos_connection
CREATE INDEX IF NOT EXISTS idx_repos_connection ON github_repos(github_connection_id);

-- index: idx_repos_language
CREATE INDEX IF NOT EXISTS idx_repos_language ON github_repos(primary_language);

-- index: idx_repos_omg
CREATE INDEX IF NOT EXISTS idx_repos_omg ON github_repos(omg_detected);

-- index: idx_salts_inserted
CREATE INDEX IF NOT EXISTS idx_salts_inserted ON analytics_salts(inserted_at);

-- index: idx_scheduled_reports_active
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active ON scheduled_reports(is_active, next_run_at);

-- index: idx_segment_members_customer
CREATE INDEX IF NOT EXISTS idx_segment_members_customer ON segment_memberships(customer_id);

-- index: idx_segment_members_segment
CREATE INDEX IF NOT EXISTS idx_segment_members_segment ON segment_memberships(segment_id);

-- index: idx_segments_name
CREATE INDEX IF NOT EXISTS idx_segments_name ON customer_segments(name);

-- index: idx_sessions_customer
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON sessions(customer_id);

-- index: idx_sessions_token
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- index: idx_site_devices_date
CREATE INDEX IF NOT EXISTS idx_site_devices_date ON site_analytics_devices_daily(date);

-- index: idx_site_events_country
CREATE INDEX IF NOT EXISTS idx_site_events_country ON site_analytics_events(country_code);

-- index: idx_site_events_session
CREATE INDEX IF NOT EXISTS idx_site_events_session ON site_analytics_events(session_id);

-- index: idx_site_events_timestamp
CREATE INDEX IF NOT EXISTS idx_site_events_timestamp ON site_analytics_events(timestamp);

-- index: idx_site_events_type
CREATE INDEX IF NOT EXISTS idx_site_events_type ON site_analytics_events(event_type);

-- index: idx_site_events_visitor
CREATE INDEX IF NOT EXISTS idx_site_events_visitor ON site_analytics_events(visitor_id);

-- index: idx_site_geo_country
CREATE INDEX IF NOT EXISTS idx_site_geo_country ON site_analytics_geo_daily(country_code);

-- index: idx_site_geo_date
CREATE INDEX IF NOT EXISTS idx_site_geo_date ON site_analytics_geo_daily(date);

-- index: idx_site_hourly_date
CREATE INDEX IF NOT EXISTS idx_site_hourly_date ON site_analytics_hourly(date);

-- index: idx_site_pageviews_date
CREATE INDEX IF NOT EXISTS idx_site_pageviews_date ON site_analytics_pageviews_daily(date);

-- index: idx_site_realtime_seen
CREATE INDEX IF NOT EXISTS idx_site_realtime_seen ON site_analytics_realtime(last_seen_at);

-- index: idx_site_referrers_date
CREATE INDEX IF NOT EXISTS idx_site_referrers_date ON site_analytics_referrers_daily(date);

-- index: idx_site_utm_date
CREATE INDEX IF NOT EXISTS idx_site_utm_date ON site_analytics_utm_daily(date);

-- index: idx_stripe_events_customer
CREATE INDEX IF NOT EXISTS idx_stripe_events_customer ON stripe_events(customer_id);

-- index: idx_stripe_events_processed
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON stripe_events(processed);

-- index: idx_stripe_events_stripe_id
CREATE INDEX IF NOT EXISTS idx_stripe_events_stripe_id ON stripe_events(stripe_event_id);

-- index: idx_stripe_events_type
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);

-- index: idx_sub_changes_customer
CREATE INDEX IF NOT EXISTS idx_sub_changes_customer ON subscription_changes(customer_id);

-- index: idx_sub_changes_date
CREATE INDEX IF NOT EXISTS idx_sub_changes_date ON subscription_changes(changed_at);

-- index: idx_sub_changes_type
CREATE INDEX IF NOT EXISTS idx_sub_changes_type ON subscription_changes(change_type);

-- index: idx_subscriptions_customer
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);

-- index: idx_tag_assignments_customer
CREATE INDEX IF NOT EXISTS idx_tag_assignments_customer ON customer_tag_assignments(customer_id);

-- index: idx_tag_assignments_tag
CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag ON customer_tag_assignments(tag_id);

-- index: idx_tags_name
CREATE INDEX IF NOT EXISTS idx_tags_name ON customer_tags(name);

-- index: idx_usage_daily_license_date
CREATE INDEX IF NOT EXISTS idx_usage_daily_license_date ON usage_daily(license_id, date);

-- index: idx_usage_license
CREATE INDEX IF NOT EXISTS idx_usage_license ON usage(license_key);

-- index: idx_usage_member_date
CREATE INDEX IF NOT EXISTS idx_usage_member_date ON usage_member_daily(license_id, date);

-- index: idx_usage_member_machine
CREATE INDEX IF NOT EXISTS idx_usage_member_machine ON usage_member_daily(machine_id);

-- index: idx_webhook_dlq_created
CREATE INDEX IF NOT EXISTS idx_webhook_dlq_created ON webhook_dlq(created_at);

-- index: idx_webhook_dlq_type
CREATE INDEX IF NOT EXISTS idx_webhook_dlq_type ON webhook_dlq(webhook_type);

-- view: analytics_geo_combined
CREATE VIEW IF NOT EXISTS analytics_geo_combined AS
SELECT
  country_code,
  SUM(visitors) as total_visitors,
  SUM(sessions) as total_sessions,
  SUM(pageviews) as total_pageviews,
  'site' as source
FROM site_analytics_geo_daily
WHERE date >= date('now', '-30 days')
GROUP BY country_code

UNION ALL

SELECT
  country_code,
  0 as total_visitors,
  SUM(sessions) as total_sessions,
  SUM(pageviews) as total_pageviews,
  'docs' as source
FROM docs_analytics_geo_daily
WHERE date >= date('now', '-30 days')
GROUP BY country_code

UNION ALL

SELECT
  json_extract(metadata, '$.country') as country_code,
  COUNT(DISTINCT json_extract(metadata, '$.machine_id')) as total_visitors,
  0 as total_sessions,
  0 as total_pageviews,
  'cli' as source
FROM audit_log
WHERE action = 'machine.registered'
  AND created_at >= datetime('now', '-30 days')
  AND json_extract(metadata, '$.country') IS NOT NULL
GROUP BY json_extract(metadata, '$.country');

-- Runtime telemetry tables that previously existed only in the alternate test schema.
CREATE TABLE IF NOT EXISTS command_event (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  session_id TEXT,
  command TEXT NOT NULL,
  subcommand TEXT,
  packages TEXT,
  duration_ms INTEGER DEFAULT 0,
  success INTEGER DEFAULT 1,
  error TEXT,
  result_count INTEGER,
  updated_count INTEGER,
  timestamp DATETIME NOT NULL,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  start_time DATETIME,
  end_time DATETIME,
  commands_run INTEGER,
  duration_secs INTEGER,
  timestamp DATETIME NOT NULL,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS performance_metric (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  context TEXT,
  timestamp DATETIME NOT NULL,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feature_usage (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  metadata TEXT,
  timestamp DATETIME NOT NULL,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_command_event_license_timestamp
  ON command_event(license_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_session_license_timestamp
  ON session(license_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_metric_license_timestamp
  ON performance_metric(license_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_feature_usage_license_timestamp
  ON feature_usage(license_id, timestamp);
