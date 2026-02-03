export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'comp_month')
    const { teamId, reason } = await req.json()

    if (!teamId || !reason) {
      return NextResponse.json(
        { error: 'teamId and reason are required' },
        { status: 400 }
      )
    }

    if (reason.trim().length < 3) {
      return NextResponse.json(
        { error: 'Reason must be at least 3 characters' },
        { status: 400 }
      )
    }

    // Fetch team with stripe data
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select(`
        id, name, plan_tier,
        stripe_customers(id, subscription_status, current_period_end)
      `)
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const stripe = (team as Record<string, unknown>).stripe_customers as
      | { id: string; subscription_status: string; current_period_end: string | null }[]
      | null
    const stripeRecord = stripe?.[0]

    if (!stripeRecord) {
      return NextResponse.json(
        { error: 'No billing record found for this customer' },
        { status: 400 }
      )
    }

    if (stripeRecord.subscription_status !== 'active') {
      return NextResponse.json(
        { error: 'Can only comp months for active paid accounts' },
        { status: 400 }
      )
    }

    // Add 30 days to current_period_end
    const currentEnd = stripeRecord.current_period_end
      ? new Date(stripeRecord.current_period_end)
      : new Date()

    const newEnd = new Date(currentEnd.getTime() + 30 * 24 * 60 * 60 * 1000)

    const { error: updateError } = await supabase
      .from('stripe_customers')
      .update({
        current_period_end: newEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('team_id', teamId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to comp month' }, { status: 500 })
    }

    // Log admin action
    await logAdminAction(admin.adminId, 'comp_month', {
      targetTeamId: teamId,
      reason: reason.trim(),
      details: {
        days_added: 30,
        previous_period_end: currentEnd.toISOString(),
        new_period_end: newEnd.toISOString(),
        team_name: team.name,
      },
    })

    return NextResponse.json({
      success: true,
      new_period_end: newEnd.toISOString(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
