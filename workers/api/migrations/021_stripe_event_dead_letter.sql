-- Add a terminal dead-letter state for poison Stripe webhook events.
-- SQLite cannot widen a CHECK constraint in place, so rebuild the inbox while
-- preserving every durable claim, error, and audit field.
CREATE TABLE stripe_events_next (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  customer_id TEXT,
  stripe_customer_id TEXT,
  event_data TEXT,
  processed INTEGER DEFAULT 0,
  processed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  processing_started_at DATETIME,
  last_error TEXT,
  claim_token TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

INSERT INTO stripe_events_next (
  id, stripe_event_id, event_type, customer_id, stripe_customer_id,
  event_data, processed, processed_at, created_at, status, attempt_count,
  processing_started_at, last_error, claim_token
)
SELECT
  id, stripe_event_id, event_type, customer_id, stripe_customer_id,
  event_data, processed, processed_at, created_at, status, attempt_count,
  processing_started_at, last_error, claim_token
FROM stripe_events;

DROP TABLE stripe_events;
ALTER TABLE stripe_events_next RENAME TO stripe_events;

CREATE INDEX idx_stripe_events_customer ON stripe_events(customer_id);
CREATE INDEX idx_stripe_events_processed ON stripe_events(processed);
CREATE INDEX idx_stripe_events_stripe_id ON stripe_events(stripe_event_id);
CREATE INDEX idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX idx_stripe_events_status ON stripe_events(status);
