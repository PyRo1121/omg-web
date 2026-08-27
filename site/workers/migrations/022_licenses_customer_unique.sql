-- A customer owns exactly one license. Provisioning uses this invariant to make
-- concurrent authentication and site-session adoption idempotent.
DROP INDEX IF EXISTS idx_licenses_customer;
CREATE UNIQUE INDEX idx_licenses_customer ON licenses(customer_id);
