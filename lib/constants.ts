/**
 * Shared constants for plan data, status labels, and display helpers.
 * Single source of truth — replaces stale local copies across pages.
 */

// ---------------------------------------------------------------------------
// Plan tier display names (all 8 tiers)
// ---------------------------------------------------------------------------
export const TIER_LABELS: Record<string, string> = {
  free_trial: 'Free Trial',
  solo: 'Solo',
  solo_pro: 'Solo Pro',
  solo_max: 'Solo Max',
  team_starter: 'Team Starter',
  team_growth: 'Team Growth',
  team_pro: 'Team Pro',
  enterprise: 'Enterprise',
}

// ---------------------------------------------------------------------------
// Lockbox limits per plan (matches main app lib/stripe.ts)
// ---------------------------------------------------------------------------
export const LOCKBOX_LIMITS: Record<string, number> = {
  free_trial: 25,
  solo: 10,
  solo_pro: 25,
  solo_max: 50,
  team_starter: 25,
  team_growth: 50,
  team_pro: 100,
  enterprise: Infinity,
}

// ---------------------------------------------------------------------------
// User limits per plan
// ---------------------------------------------------------------------------
export const USER_LIMITS: Record<string, number> = {
  free_trial: 10,
  solo: 1,
  solo_pro: 1,
  solo_max: 1,
  team_starter: 10,
  team_growth: 20,
  team_pro: 40,
  enterprise: 999,
}

// ---------------------------------------------------------------------------
// Plan tier filter dropdown options
// ---------------------------------------------------------------------------
export const PLAN_TIERS = [
  { value: '', label: 'All Plans' },
  { value: 'free_trial', label: 'Free Trial' },
  { value: 'solo', label: 'Solo' },
  { value: 'solo_pro', label: 'Solo Pro' },
  { value: 'solo_max', label: 'Solo Max' },
  { value: 'team_starter', label: 'Team Starter' },
  { value: 'team_growth', label: 'Team Growth' },
  { value: 'team_pro', label: 'Team Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

// ---------------------------------------------------------------------------
// Customer status badges
// ---------------------------------------------------------------------------
export const STATUS_COLORS: Record<string, string> = {
  active_trial: 'bg-blue-100 text-blue-800',
  active_paid: 'bg-green-100 text-green-800',
  past_due: 'bg-red-100 text-red-800',
  pending_cancellation: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

export const STATUS_LABELS: Record<string, string> = {
  active_trial: 'Active Trial',
  active_paid: 'Active Paid',
  past_due: 'Past Due',
  pending_cancellation: 'Pending Cancel',
  cancelled: 'Cancelled',
}

// ---------------------------------------------------------------------------
// Solo plan tiers (for Account Owner vs Team Leader label)
// ---------------------------------------------------------------------------
export const SOLO_PLANS = ['solo', 'solo_pro', 'solo_max']
