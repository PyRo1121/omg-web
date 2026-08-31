-- Prevent duplicate customer identity rows from find-or-create races.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
