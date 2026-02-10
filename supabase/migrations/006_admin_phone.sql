-- Add phone column to admin_users and admin_invitations
-- Run this in Supabase Dashboard SQL Editor

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE admin_invitations ADD COLUMN IF NOT EXISTS phone TEXT;
