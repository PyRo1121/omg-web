-- Status precedence for monotonic subscription projections: terminal states
-- outrank transient ones at equal period end, so a stale concurrent snapshot
-- can never resurrect a canceled subscription.
ALTER TABLE subscriptions ADD COLUMN status_rank INTEGER NOT NULL DEFAULT 0;

UPDATE subscriptions SET status_rank = CASE
  WHEN status = 'canceled' THEN 3
  WHEN status IN ('unpaid', 'past_due', 'incomplete_expired') THEN 2
  WHEN status IN ('active', 'trialing', 'incomplete') THEN 1
  ELSE 0
END;
