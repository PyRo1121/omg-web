-- Bound verification attempts and invalidate plaintext OTPs issued by earlier code.
ALTER TABLE auth_codes ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;

UPDATE auth_codes
SET used = 1
WHERE used = 0;
