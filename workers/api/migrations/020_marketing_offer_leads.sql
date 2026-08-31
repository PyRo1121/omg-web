-- One introductory offer per normalized email. The creating/ready state and
-- claim token prevent concurrent requests from minting multiple Stripe codes.
CREATE TABLE marketing_offer_leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed')),
  claim_token TEXT,
  stripe_promotion_code_id TEXT UNIQUE,
  promotion_code TEXT UNIQUE,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  CHECK (
    (status = 'ready' AND stripe_promotion_code_id IS NOT NULL AND promotion_code IS NOT NULL AND expires_at IS NOT NULL)
    OR status != 'ready'
  )
);

CREATE INDEX idx_marketing_offer_leads_status_updated
  ON marketing_offer_leads (status, updated_at);
