-- Add trial_ends_at to teams table
-- Needed so the admin backend can extend trials by a specific number of days.
-- Default: 14 days after signup (matches the default trial period in the main app).
-- Run this in Supabase SQL Editor.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Backfill existing free_trial teams: set trial_ends_at = created_at + 14 days
UPDATE teams
SET trial_ends_at = created_at + INTERVAL '14 days'
WHERE plan_tier = 'free_trial' AND trial_ends_at IS NULL;
