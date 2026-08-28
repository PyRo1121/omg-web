-- Better Auth 1.7.1 organization plugin tables. Better Auth owns these rows;
-- Wrangler remains the sole schema and migration authority.

ALTER TABLE auth_session ADD COLUMN active_organization_id TEXT;

CREATE INDEX IF NOT EXISTS auth_session_activeOrganizationId_idx
  ON auth_session(active_organization_id);

CREATE TABLE IF NOT EXISTS auth_organization (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo TEXT,
  created_at INTEGER NOT NULL,
  metadata TEXT,
  billing_customer_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY (billing_customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS auth_organization_slug_idx
  ON auth_organization(slug);

CREATE TABLE IF NOT EXISTS auth_member (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES auth_organization(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES auth_user(id) ON DELETE CASCADE,
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS auth_member_organizationId_idx
  ON auth_member(organization_id);

CREATE INDEX IF NOT EXISTS auth_member_userId_idx
  ON auth_member(user_id);

CREATE TABLE IF NOT EXISTS auth_invitation (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL CHECK (email = lower(email)),
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'canceled')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  inviter_id TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES auth_organization(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_id) REFERENCES auth_user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS auth_invitation_organizationId_idx
  ON auth_invitation(organization_id);

CREATE INDEX IF NOT EXISTS auth_invitation_email_idx
  ON auth_invitation(email);

CREATE UNIQUE INDEX IF NOT EXISTS auth_invitation_pending_email_idx
  ON auth_invitation(organization_id, email)
  WHERE status = 'pending';

-- Better Auth performs a friendly application-level membership check. This
-- trigger is the final integrity boundary for concurrent invitation accepts.
CREATE TRIGGER IF NOT EXISTS auth_member_paid_seat_guard
BEFORE INSERT ON auth_member
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM auth_organization AS organization
    JOIN licenses AS license
      ON license.customer_id = organization.billing_customer_id
    WHERE organization.id = NEW.organization_id
      AND license.status = 'active'
      AND license.tier IN ('team', 'enterprise')
      AND license.max_seats IS NOT NULL
      AND license.max_seats > (
        SELECT COUNT(*)
        FROM auth_member AS existing_member
        WHERE existing_member.organization_id = NEW.organization_id
      )
  ) THEN RAISE(ABORT, 'organization seat unavailable') END;
END;
