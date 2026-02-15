-- ============================================================
-- Enable RLS on Admin Backend Tables
-- Addresses Supabase security warnings for admin tables
-- ============================================================

-- 1. ADMIN_USERS
-- Deny all public API access - admin backend uses service role
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- No public policies - only accessible via service role
-- Admin backend API should authenticate using service role key

-- 2. ADMIN_INVITATIONS
-- Contains sensitive token column - deny all public API access
ALTER TABLE admin_invitations ENABLE ROW LEVEL SECURITY;

-- No public policies - only accessible via service role
-- Admin backend uses service role to create/verify invitations

-- 3. ADMIN_ACTIONS
-- Audit log - deny all public API access
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- No public policies - only accessible via service role for audit purposes

-- 4. ADMIN_LOGIN_ATTEMPTS
-- Security table - deny all public API access
ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;

-- No public policies - only accessible via service role for rate limiting logic

-- ============================================================
-- All admin tables are now protected with RLS but have no policies
-- This means they are NOT accessible via PostgREST API
-- Access is only possible using the service role key in the admin backend
-- ============================================================
