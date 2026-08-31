-- Preserve one reachable Owner for every organization. Ownership transfer
-- promotes the replacement first and then demotes the current Owner in one D1
-- batch, so the demotion sees the replacement Owner already present.
CREATE TRIGGER IF NOT EXISTS auth_member_last_owner_delete_guard
BEFORE DELETE ON auth_member
FOR EACH ROW
WHEN OLD.role = 'owner'
BEGIN
  SELECT RAISE(ABORT, 'organization must retain an owner')
  WHERE NOT EXISTS (
    SELECT 1
    FROM auth_member AS remaining
    WHERE remaining.organization_id = OLD.organization_id
      AND remaining.role = 'owner'
      AND remaining.id <> OLD.id
  );
END;

CREATE TRIGGER IF NOT EXISTS auth_member_last_owner_update_guard
BEFORE UPDATE OF role ON auth_member
FOR EACH ROW
WHEN OLD.role = 'owner' AND NEW.role <> 'owner'
BEGIN
  SELECT RAISE(ABORT, 'organization must retain an owner')
  WHERE NOT EXISTS (
    SELECT 1
    FROM auth_member AS remaining
    WHERE remaining.organization_id = OLD.organization_id
      AND remaining.role = 'owner'
      AND remaining.id <> OLD.id
  );
END;
