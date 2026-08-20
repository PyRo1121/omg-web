-- Durable Stripe webhook inbox state for idempotent processing.
ALTER TABLE stripe_events ADD COLUMN status TEXT NOT NULL DEFAULT 'received'
  CHECK (status IN ('received', 'processing', 'processed', 'failed'));
ALTER TABLE stripe_events ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stripe_events ADD COLUMN processing_started_at DATETIME;
ALTER TABLE stripe_events ADD COLUMN last_error TEXT;

UPDATE stripe_events
SET status = CASE WHEN processed = 1 THEN 'processed' ELSE 'received' END;

CREATE INDEX IF NOT EXISTS idx_stripe_events_status ON stripe_events(status);
