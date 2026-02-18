export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

const VALID_STATUSES = [
  'warning_needs_response', 'warning_under_review', 'warning_closed',
  'needs_response', 'under_review', 'prevented', 'won', 'lost',
]

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_customer_detail')

    const statusFilter = req.nextUrl.searchParams.get('status') || ''
    const teamId = req.nextUrl.searchParams.get('team_id') || ''

    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    let query = supabase
      .from('disputes')
      .select(`
        id, stripe_dispute_id, stripe_charge_id, amount, currency, reason, status,
        evidence_due_by, reminder_48hr_sent_at, reminder_24hr_sent_at, reminder_6hr_sent_at,
        resolved_at, resolution_outcome, created_at, updated_at, team_id,
        teams:team_id(id, name)
      `)
      .order('evidence_due_by', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200)

    if (statusFilter) query = query.eq('status', statusFilter)
    if (teamId) query = query.eq('team_id', teamId)

    const { data: disputes, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 })
    }

    const now = Date.now()

    const formatted = (disputes || []).map((d) => {
      const team = d.teams as unknown as { id: string; name: string } | null
      const dueMs = d.evidence_due_by ? new Date(d.evidence_due_by).getTime() : null
      const hoursRemaining = dueMs ? Math.floor((dueMs - now) / 1000 / 60 / 60) : null

      let urgency: 'critical' | 'urgent' | 'warning' | 'normal' = 'normal'
      if (hoursRemaining !== null && hoursRemaining >= 0) {
        if (hoursRemaining < 24) urgency = 'critical'
        else if (hoursRemaining < 48) urgency = 'urgent'
        else if (hoursRemaining < 7 * 24) urgency = 'warning'
      }

      return {
        id: d.id,
        stripe_dispute_id: d.stripe_dispute_id,
        stripe_charge_id: d.stripe_charge_id,
        team_id: d.team_id,
        team_name: team?.name ?? 'Unknown',
        amount: d.amount,
        currency: d.currency,
        reason: d.reason,
        status: d.status,
        evidence_due_by: d.evidence_due_by,
        hours_remaining: hoursRemaining,
        urgency,
        reminders_sent: {
          h48: !!d.reminder_48hr_sent_at,
          h24: !!d.reminder_24hr_sent_at,
          h6: !!d.reminder_6hr_sent_at,
        },
        resolved_at: d.resolved_at,
        resolution_outcome: d.resolution_outcome,
        created_at: d.created_at,
        updated_at: d.updated_at,
      }
    })

    // Summary counts
    const counts: Record<string, number> = {}
    for (const d of formatted) {
      counts[d.status] = (counts[d.status] || 0) + 1
    }

    const actionNeeded = formatted.filter((d) =>
      d.status === 'needs_response' || d.status === 'warning_needs_response'
    ).length

    const urgentCount = formatted.filter(
      (d) => d.urgency === 'critical' || d.urgency === 'urgent'
    ).length

    return NextResponse.json({
      disputes: formatted,
      summary: {
        total: formatted.length,
        action_needed: actionNeeded,
        urgent: urgentCount,
        by_status: counts,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
