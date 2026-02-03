export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, computeCustomerStatus } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_system_health')

    const now = new Date()
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch all teams with stripe data (for status computation)
    const [
      { data: teams },
      { data: signups24h },
      { data: signups7d },
      { data: codeViews },
      { data: lockboxes },
    ] = await Promise.all([
      supabase
        .from('teams')
        .select('id, plan_tier, created_at, stripe_customers(subscription_status, cancel_at_period_end)'),
      supabase
        .from('teams')
        .select('id, plan_tier')
        .gte('created_at', ago24h),
      supabase
        .from('teams')
        .select('id, plan_tier')
        .gte('created_at', ago7d),
      supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'code_viewed'),
      supabase
        .from('lockboxes')
        .select('id, status'),
    ])

    // --- Card 1: New Signups (24h) ---
    const s24h = signups24h || []
    const signups24hByTier: Record<string, number> = {}
    for (const t of s24h) {
      signups24hByTier[t.plan_tier] = (signups24hByTier[t.plan_tier] || 0) + 1
    }

    // --- Card 2: New Signups (7d) ---
    const s7d = signups7d || []
    const signups7dByTier: Record<string, number> = {}
    for (const t of s7d) {
      signups7dByTier[t.plan_tier] = (signups7dByTier[t.plan_tier] || 0) + 1
    }

    // --- Card 3: Total Lockbox Code Views ---
    const totalCodeViews = codeViews as unknown as { count: number } | null

    // --- Card 4: Total Customers (active, exclude cancelled/pending_cancellation) ---
    const allTeams = (teams || []) as {
      id: string
      plan_tier: string
      stripe_customers: { subscription_status: string; cancel_at_period_end: boolean }[]
    }[]
    let activeTrial = 0
    let activePaid = 0
    let pendingCancellation = 0
    for (const t of allTeams) {
      const stripe = t.stripe_customers?.[0] || null
      const status = computeCustomerStatus(t.plan_tier, stripe)
      if (status === 'active_trial') activeTrial++
      else if (status === 'active_paid') activePaid++
      else if (status === 'pending_cancellation') pendingCancellation++
    }
    const totalActiveCustomers = activeTrial + activePaid

    // --- Card 5: Total Lockboxes ---
    const allLockboxes = lockboxes || []
    const totalLockboxes = allLockboxes.length

    // --- Card 6: Total Active Installations ---
    const totalInstalled = allLockboxes.filter((l) => l.status === 'installed').length

    return NextResponse.json({
      signups_24h: {
        total: s24h.length,
        by_tier: signups24hByTier,
      },
      signups_7d: {
        total: s7d.length,
        by_tier: signups7dByTier,
      },
      total_code_views: (totalCodeViews as unknown as { count: number })?.count ?? 0,
      total_customers: {
        active: totalActiveCustomers,
        trial: activeTrial,
        paid: activePaid,
        pending_cancellation: pendingCancellation,
      },
      total_lockboxes: totalLockboxes,
      total_installed: totalInstalled,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
