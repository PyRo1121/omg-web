-- Better Auth 1.7 requires an issuer column on the credential table, with a
-- unique (issuer, account_id) pair. The default backfills the pre-existing row.

ALTER TABLE auth_account ADD COLUMN issuer TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS auth_account_issuer_accountId_idx
  ON auth_account (issuer, account_id);
