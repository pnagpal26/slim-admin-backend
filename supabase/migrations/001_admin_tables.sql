-- ============================================================
-- SLIM Admin Backend — Database Migration
-- Run this in Supabase SQL Editor against the same database
-- as the main SLIM app.
-- ============================================================

-- 1. Admin Users (separate from customer `users` table)
-- Roles: super_admin, support_l1, support_l2
CREATE TABLE admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'support_l1', 'support_l2')),
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- 2. Admin Invitations (for onboarding new admin/support staff)
-- Super Admin invites L1/L2 users; tokens expire after 24 hours
CREATE TABLE admin_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('support_l1', 'support_l2')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES admin_users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_invitations_token ON admin_invitations(token);
CREATE INDEX idx_admin_invitations_email ON admin_invitations(email);

-- 3. Admin Actions audit log
-- Every action taken in the admin backend is logged here
CREATE TABLE admin_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES admin_users(id),
  action_type TEXT NOT NULL,
  target_team_id UUID REFERENCES teams(id),
  target_user_id UUID REFERENCES users(id),
  details JSONB,
  reason TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_admin_user_id ON admin_actions(admin_user_id);
CREATE INDEX idx_admin_actions_target_team_id ON admin_actions(target_team_id);
CREATE INDEX idx_admin_actions_performed_at ON admin_actions(performed_at);
CREATE INDEX idx_admin_actions_action_type ON admin_actions(action_type);

-- 4. Error Log (populated by main app's API error handling)
-- Admin backend reads this table to display errors
CREATE TABLE error_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  error_type TEXT,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  endpoint TEXT,
  request_method TEXT,
  request_body JSONB,
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES users(id),
  user_agent TEXT,
  ip_address TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  resolved_by UUID REFERENCES admin_users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_error_log_status ON error_log(status);
CREATE INDEX idx_error_log_created_at ON error_log(created_at);
CREATE INDEX idx_error_log_team_id ON error_log(team_id);
CREATE INDEX idx_error_log_endpoint ON error_log(endpoint);
