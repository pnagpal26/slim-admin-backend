export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, computeCustomerStatus } from '@/lib/api-helpers'
import { ADMIN_COOKIE_NAME, verifyAdminToken } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const admin = requireRole(req, 'view_alerts')

    const now = new Date()
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const ago3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
    const ago7dInactive = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Get admin's last viewed timestamp
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('last_viewed_alerts_at')
      .eq('id', admin.adminId)
      .single()

    const lastViewed = adminUser?.last_viewed_alerts_at || null

    // Update last_viewed_alerts_at
    await supabase
      .from('admin_users')
      .update({ last_viewed_alerts_at: now.toISOString() })
      .eq('id', admin.adminId)

    // 1. Errors
    const [{ count: errors24h }, { count: errors7d }] = await Promise.all([
      supabase
        .from('error_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('created_at', ago24h),
      supabase
        .from('error_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('created_at', ago7d),
    ])

    // 2-6: Fetch all teams with users and stripe data
    const { data: teams } = await supabase
      .from('teams')
      .select(`
        id, name, plan_tier, billing_exempt, created_at, trial_ends_at,
        users(id, email, name, role, last_active_at, is_active),
        stripe_customers(subscription_status, cancel_at_period_end, current_period_end),
        lockboxes:lockboxes(id, status)
      `)

    const allTeams = (teams || []) as {
      id: string
      name: string
      plan_tier: string
      billing_exempt: boolean
      created_at: string
      trial_ends_at: string | null
      users: { id: string; email: string; name: string; role: string; last_active_at: string | null; is_active: boolean }[]
      stripe_customers: { subscription_status: string; cancel_at_period_end: boolean; current_period_end: string | null }[]
      lockboxes: { id: string; status: string }[]
    }[]

    const failedPayments: { team_id: string; team_name: string; email: string; plan_tier: string; days_overdue: number }[] = []
    const trialExpiring: { team_id: string; team_name: string; email: string; days_remaining: number; lockboxes_added: number }[] = []
    const pendingCancellations: { team_id: string; team_name: string; email: string; plan_tier: string; cancellation_date: string | null }[] = []
    const inactiveAccounts: { team_id: string; team_name: string; email: string; signup_date: string; days_since_login: number; is_trial: boolean }[] = []
    const highUsage: { team_id: string; team_name: string; installed: number; plan_limit: number; plan_tier: string; usage_text: string }[] = []

    const planLimits: Record<string, number> = {
      free_trial: 5, solo: 1, small: 5, medium: 15, enterprise: 9999,
    }

    for (const team of allTeams) {
      const stripe = team.stripe_customers?.[0] || null
      const status = computeCustomerStatus(team.plan_tier, stripe)
      const leader = team.users.find((u) => u.role === 'team_leader' || u.role === 'solo_agent')
      const email = leader?.email || 'N/A'
      const lastLogin = team.users.reduce<string | null>((latest, u) => {
        if (!u.last_active_at) return latest
        if (!latest) return u.last_active_at
        return u.last_active_at > latest ? u.last_active_at : latest
      }, null)

      // 2. Failed Payments
      if (status === 'past_due' && stripe?.current_period_end) {
        const endDate = new Date(stripe.current_period_end)
        const daysOverdue = Math.floor((now.getTime() - endDate.getTime()) / (24 * 60 * 60 * 1000))
        failedPayments.push({
          team_id: team.id,
          team_name: team.name,
          email,
          plan_tier: team.plan_tier,
          days_overdue: Math.max(0, daysOverdue),
        })
      }

      // 3. Trial Expiring Soon (within 3 days)
      if (status === 'active_trial') {
        const trialEnd = team.trial_ends_at
          ? new Date(team.trial_ends_at)
          : new Date(new Date(team.created_at).getTime() + 14 * 24 * 60 * 60 * 1000)
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        if (daysRemaining >= 0 && daysRemaining <= 3) {
          trialExpiring.push({
            team_id: team.id,
            team_name: team.name,
            email,
            days_remaining: daysRemaining,
            lockboxes_added: team.lockboxes?.length || 0,
          })
        }
      }

      // 4. Pending Cancellations
      if (status === 'pending_cancellation') {
        pendingCancellations.push({
          team_id: team.id,
          team_name: team.name,
          email,
          plan_tier: team.plan_tier,
          cancellation_date: stripe?.current_period_end || null,
        })
      }

      // 5. Inactive Accounts (no login in 7+ days, exclude cancelled)
      if (status !== 'cancelled' && status !== 'pending_cancellation') {
        if (!lastLogin || lastLogin < ago7dInactive) {
          const daysSince = lastLogin
            ? Math.floor((now.getTime() - new Date(lastLogin).getTime()) / (24 * 60 * 60 * 1000))
            : Math.floor((now.getTime() - new Date(team.created_at).getTime()) / (24 * 60 * 60 * 1000))
          inactiveAccounts.push({
            team_id: team.id,
            team_name: team.name,
            email,
            signup_date: team.created_at,
            days_since_login: daysSince,
            is_trial: status === 'active_trial',
          })
        }
      }

      // 6. High Usage (> 80% of plan limit)
      if (status !== 'cancelled') {
        const limit = planLimits[team.plan_tier] || 5
        const installed = team.lockboxes?.filter((l) => l.status === 'installed').length || 0
        if (limit < 9999 && installed > 0) {
          const percent = Math.round((installed / limit) * 100)
          if (percent > 80) {
            highUsage.push({
              team_id: team.id,
              team_name: team.name,
              installed,
              plan_limit: limit,
              plan_tier: team.plan_tier,
              usage_text: `${installed}/${limit} installed`,
            })
          }
        }
      }
    }

    // Sort each list
    failedPayments.sort((a, b) => b.days_overdue - a.days_overdue)
    trialExpiring.sort((a, b) => a.days_remaining - b.days_remaining)
    inactiveAccounts.sort((a, b) => b.days_since_login - a.days_since_login)
    highUsage.sort((a, b) => (b.installed / b.plan_limit) - (a.installed / a.plan_limit))

    return NextResponse.json({
      last_viewed: lastViewed,
      errors: {
        count_24h: errors24h || 0,
        count_7d: errors7d || 0,
      },
      failed_payments: failedPayments,
      trial_expiring: trialExpiring,
      pending_cancellations: pendingCancellations,
      inactive_accounts: inactiveAccounts,
      high_usage: highUsage,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
