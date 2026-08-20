# Legacy licensing migrations

These SQL files are the immutable historical inputs that preceded the canonical baseline. They are retained for production-history reconciliation only.

Wrangler does **not** read this directory. The configured migration authority is `../migrations/`.

Do not edit, rename, copy back, or apply these files individually. Before recording the canonical baseline on an existing database, compare the remote `d1_migrations` history and schema with `../migrations/0000_current_baseline.sql`. Resolve drift with a new forward-only migration.
