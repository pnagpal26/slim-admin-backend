export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

const VALID_STATUSES = ['pending', 'succeeded', 'failed', 'canceled']

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_customer_detail')

    const statusFilter = req.nextUrl.searchParams.get('status') || ''
    const teamId = req.nextUrl.searchParams.get('team_id') || ''

    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    let query = supabase
      .from('refunds')
      .select(`
        id, stripe_refund_id, stripe_charge_id, amount_refunded, currency,
        reason, status, created_at, updated_at, team_id,
        teams:team_id(id, name)
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (statusFilter) query = query.eq('status', statusFilter)
    if (teamId) query = query.eq('team_id', teamId)

    const { data: refunds, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch refunds' }, { status: 500 })
    }

    const formatted = (refunds || []).map((r) => {
      const team = r.teams as unknown as { id: string; name: string } | null
      return {
        id: r.id,
        stripe_refund_id: r.stripe_refund_id,
        stripe_charge_id: r.stripe_charge_id,
        team_id: r.team_id,
        team_name: team?.name ?? 'Unknown',
        amount_refunded: r.amount_refunded,
        currency: r.currency,
        reason: r.reason,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }
    })

    const totalAmount = formatted
      .filter((r) => r.status === 'succeeded')
      .reduce((sum, r) => sum + r.amount_refunded, 0)

    const counts: Record<string, number> = {}
    for (const r of formatted) {
      counts[r.status] = (counts[r.status] || 0) + 1
    }

    return NextResponse.json({
      refunds: formatted,
      summary: {
        total: formatted.length,
        total_amount_succeeded: totalAmount,
        by_status: counts,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
