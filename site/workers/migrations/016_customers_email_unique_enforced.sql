-- Enforce customers.email uniqueness for real.
--
-- Migration 015 was a silent no-op: 0000_current_baseline already created a
-- NON-unique idx_customers_email, so `CREATE UNIQUE INDEX IF NOT EXISTS`
-- skipped. This migration merges any race-born duplicates into the oldest
-- row per email, replaces the index with a genuinely unique one.
--
-- Child tables re-pointed: licenses, sessions, subscriptions, invoices,
-- audit_log, customer_notes, customer_tag_assignments.

UPDATE OR IGNORE licenses SET customer_id =
  (SELECT MIN(p.id) FROM customers p WHERE p.email = (SELECT email FROM customers WHERE id = licenses.customer_id))
  WHERE customer_id NOT IN (SELECT MIN(id) FROM customers GROUP BY email);

UPDATE OR IGNORE sessions SET customer_id =
  (SELECT MIN(p.id) FROM customers p WHERE p.email = (SELECT email FROM customers WHERE id = sessions.customer_id))
  WHERE customer_id NOT IN (SELECT MIN(id) FROM customers GROUP BY email);

UPDATE OR IGNORE subscriptions SET customer_id =
  (SELECT MIN(p.id) FROM customers p WHERE p.email = (SELECT email FROM customers WHERE id = subscriptions.customer_id))
  WHERE customer_id NOT IN (SELECT MIN(id) FROM customers GROUP BY email);

UPDATE OR IGNORE invoices SET customer_id =
  (SELECT MIN(p.id) FROM customers p WHERE p.email = (SELECT email FROM customers WHERE id = invoices.customer_id))
  WHERE customer_id NOT IN (SELECT MIN(id) FROM customers GROUP BY email);

UPDATE OR IGNORE audit_log SET customer_id =
  (SELECT MIN(p.id) FROM customers p WHERE p.email = (SELECT email FROM customers WHERE id = audit_log.customer_id))
  WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT MIN(id) FROM customers GROUP BY email);

UPDATE OR IGNORE customer_notes SET customer_id =
  (SELECT MIN(p.id) FROM customers p WHERE p.email = (SELECT email FROM customers WHERE id = customer_notes.customer_id))
  WHERE customer_id NOT IN (SELECT MIN(id) FROM customers GROUP BY email);

UPDATE OR IGNORE customer_tag_assignments SET customer_id =
  (SELECT MIN(p.id) FROM customers p WHERE p.email = (SELECT email FROM customers WHERE id = customer_tag_assignments.customer_id))
  WHERE customer_id NOT IN (SELECT MIN(id) FROM customers GROUP BY email);

-- Assignment rows that collided on (customer_id, tag_id) during the merge
-- would now be orphans pointing at doomed rows; drop them.
DELETE FROM customer_tag_assignments
  WHERE customer_id NOT IN (SELECT MIN(id) FROM customers GROUP BY email);

DELETE FROM customers
  WHERE id NOT IN (SELECT MIN(id) FROM customers GROUP BY email);

DROP INDEX IF EXISTS idx_customers_email;
CREATE UNIQUE INDEX idx_customers_email ON customers(email);
