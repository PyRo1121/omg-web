-- Store only one-way digests for newly issued Worker sessions.
-- Existing plaintext rows remain readable during their bounded session lifetime and
-- are upgraded after the first successful validation.
ALTER TABLE sessions ADD COLUMN token_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash
  ON sessions(token_hash)
  WHERE token_hash IS NOT NULL;
