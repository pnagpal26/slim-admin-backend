-- ============================================================
-- Split name into first_name / last_name
-- Applies to: admin_users, admin_invitations
-- ============================================================

-- 1. Admin Users table
ALTER TABLE admin_users ADD COLUMN first_name TEXT;
ALTER TABLE admin_users ADD COLUMN last_name TEXT;

UPDATE admin_users SET
  first_name = split_part(name, ' ', 1),
  last_name = CASE
    WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
    ELSE ''
  END;

ALTER TABLE admin_users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE admin_users DROP COLUMN name;

-- 2. Admin Invitations table
ALTER TABLE admin_invitations ADD COLUMN first_name TEXT;
ALTER TABLE admin_invitations ADD COLUMN last_name TEXT;

UPDATE admin_invitations SET
  first_name = split_part(name, ' ', 1),
  last_name = CASE
    WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
    ELSE ''
  END;

ALTER TABLE admin_invitations ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE admin_invitations DROP COLUMN name;
