-- Per-license usage dimensions prevent one tenant's self-reported package or
-- runtime counts from becoming another tenant's dashboard data.
CREATE TABLE usage_package_daily (
  license_id TEXT NOT NULL,
  date TEXT NOT NULL,
  package_name TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  PRIMARY KEY (license_id, date, package_name),
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_package_daily_license_date
  ON usage_package_daily (license_id, date);

CREATE TABLE usage_runtime_daily (
  license_id TEXT NOT NULL,
  date TEXT NOT NULL,
  runtime TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  PRIMARY KEY (license_id, date, runtime),
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE INDEX idx_usage_runtime_daily_license_date
  ON usage_runtime_daily (license_id, date);
