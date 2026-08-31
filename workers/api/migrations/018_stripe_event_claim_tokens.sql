-- Claim ownership for the webhook event inbox: a worker completing work must
-- prove it still owns the claim, so an expired lease reclaimed by another
-- worker cannot have its result overwritten by the stale owner.
ALTER TABLE stripe_events ADD COLUMN claim_token TEXT;
