export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, computeCustomerStatus } from '@/lib/api-helpers'
import { formatPersonName } from '@/lib/utils/format'
import { LOCKBOX_LIMITS } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const admin = requireRole(req, 'view_customer_detail')
    const teamId = req.nextUrl.searchParams.get('id')

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 })
    }

    // Fetch team with users and stripe data
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select(`
        id, name, plan_tier, billing_exempt, created_at, trial_ends_at,
        account_status, suspended_at, suspended_reason, suspended_by_admin_id,
        re_enabled_at, re_enabled_by,
        stripe_customers(
          stripe_customer_id, stripe_subscription_id, subscription_status,
          cancel_at_period_end, current_period_end, created_at
        )
      `)
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Fetch team members
    const { data: members } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, phone, role, is_active, is_verified, last_active_at, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true })

    // Fetch pending invitations
    const { data: invitations } = await supabase
      .from('invitations')
      .select('id, email, first_name, last_name, role, status, created_at, expires_at')
      .eq('team_id', teamId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    // Fetch lockbox counts by status — NEVER select code_encrypted
    const { data: lockboxes } = await supabase
      .from('lockboxes')
      .select('id, status')
      .eq('team_id', teamId)

    // Fetch recent audit log entries (last 20)
    const { data: auditEntries } = await supabase
      .from('audit_log')
      .select(`
        id, action, performed_at, action_method, details,
        before_state, after_state, lockbox_id,
        users:performed_by(id, first_name, last_name, email)
      `)
      .eq('lockbox_id.team_id' as never, teamId)
      .order('performed_at', { ascending: false })
      .limit(20)

    // Fallback: if the relation filter doesn't work, fetch via lockbox IDs
    let activity = auditEntries
    if (!activity || activity.length === 0) {
      const lockboxIds = lockboxes?.map((l) => l.id) || []
      if (lockboxIds.length > 0) {
        const { data: fallbackEntries } = await supabase
          .from('audit_log')
          .select(`
            id, action, performed_at, action_method, details,
            before_state, after_state, lockbox_id,
            users:performed_by(id, first_name, last_name, email)
          `)
          .in('lockbox_id', lockboxIds)
          .order('performed_at', { ascending: false })
          .limit(20)
        activity = fallbackEntries
      }
    }

    // Compute derived data
    const stripe = (team as Record<string, unknown>).stripe_customers as
      | { subscription_status: string; cancel_at_period_end: boolean; current_period_end: string | null }[]
      | null
    const stripeData = stripe?.[0] || null
    const status = computeCustomerStatus(team.plan_tier, stripeData)

    const leader = members?.find(
      (m) => m.role === 'team_leader' || m.role === 'solo_agent'
    )
    const lastLogin = members?.reduce<string | null>((latest, m) => {
      if (!m.last_active_at) return latest
      if (!latest) return m.last_active_at
      return m.last_active_at > latest ? m.last_active_at : latest
    }, null) || null

    // Lockbox usage summary
    const lockboxStatuses = lockboxes || []
    const usageSummary = {
      total: lockboxStatuses.length,
      available: lockboxStatuses.filter((l) => l.status === 'available').length,
      checked_out: lockboxStatuses.filter((l) => l.status === 'checked_out').length,
      installed: lockboxStatuses.filter((l) => l.status === 'installed').length,
      in_transit: lockboxStatuses.filter((l) => l.status === 'in_transit').length,
      removed: lockboxStatuses.filter((l) => l.status === 'removed').length,
      out_of_service: lockboxStatuses.filter((l) => l.status === 'out_of_service').length,
    }

    const planLimit = LOCKBOX_LIMITS[team.plan_tier] || 25

    return NextResponse.json({
      account: {
        id: team.id,
        team_name: team.name,
        plan_tier: team.plan_tier,
        billing_exempt: team.billing_exempt,
        signup_date: team.created_at,
        trial_ends_at: team.trial_ends_at,
        last_login: lastLogin,
        status,
        account_status: team.account_status || 'active',
        suspended_at: team.suspended_at || null,
        suspended_reason: team.suspended_reason || null,
        suspended_by_admin_id: team.suspended_by_admin_id || null,
        re_enabled_at: team.re_enabled_at || null,
        re_enabled_by: team.re_enabled_by || null,
        leader: leader
          ? { id: leader.id, first_name: formatPersonName(leader.first_name), last_name: formatPersonName(leader.last_name), name: [formatPersonName(leader.first_name), formatPersonName(leader.last_name)].filter(Boolean).join(' '), email: leader.email, phone: leader.phone }
          : null,
        stripe: stripeData
          ? {
              subscription_status: stripeData.subscription_status,
              cancel_at_period_end: stripeData.cancel_at_period_end,
              current_period_end: stripeData.current_period_end,
            }
          : null,
      },
      usage: {
        ...usageSummary,
        plan_limit: planLimit,
        usage_percent: planLimit > 0 ? Math.round((usageSummary.installed / planLimit) * 100) : 0,
      },
      members: (members || []).map((m) => ({
        ...m,
        name: [formatPersonName(m.first_name), formatPersonName(m.last_name)].filter(Boolean).join(' '),
      })),
      invitations: (invitations || []).map((inv) => ({
        ...inv,
        name: [formatPersonName(inv.first_name), formatPersonName(inv.last_name)].filter(Boolean).join(' '),
      })),
      recent_activity: (activity || []).map((a: Record<string, unknown>) => ({
        id: a.id,
        action: a.action,
        performed_at: a.performed_at,
        action_method: a.action_method,
        details: a.details,
        lockbox_id: a.lockbox_id,
        user: a.users
          ? {
              ...(a.users as Record<string, unknown>),
              name: [formatPersonName((a.users as Record<string, unknown>).first_name as string), formatPersonName((a.users as Record<string, unknown>).last_name as string)].filter(Boolean).join(' '),
            }
          : null,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
