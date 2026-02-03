-- Add last_viewed_alerts_at to admin_users table
-- Used to track when an admin last viewed the alerts dashboard
-- so we can highlight new alerts since their last visit.

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_viewed_alerts_at TIMESTAMPTZ;
