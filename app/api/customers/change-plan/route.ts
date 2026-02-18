export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'
import { TIER_LABELS } from '@/lib/constants'

const VALID_PLANS = Object.keys(TIER_LABELS)

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'edit_customer')
    const { teamId, newPlan, reason } = await req.json()

    if (!teamId || !newPlan || !reason) {
      return NextResponse.json(
        { error: 'teamId, newPlan, and reason are required' },
        { status: 400 }
      )
    }

    if (!VALID_PLANS.includes(newPlan)) {
      return NextResponse.json({ error: 'Invalid plan tier' }, { status: 400 })
    }

    if (reason.trim().length < 3) {
      return NextResponse.json({ error: 'Reason must be at least 3 characters' }, { status: 400 })
    }

    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, plan_tier')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (team.plan_tier === newPlan) {
      return NextResponse.json(
        { error: `Account is already on the ${TIER_LABELS[newPlan]} plan` },
        { status: 400 }
      )
    }

    const previousPlan = team.plan_tier

    const { error: updateError } = await supabase
      .from('teams')
      .update({ plan_tier: newPlan, updated_at: new Date().toISOString() })
      .eq('id', teamId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'change_plan', {
      targetTeamId: teamId,
      reason: reason.trim(),
      details: {
        previous_plan: previousPlan,
        new_plan: newPlan,
        previous_plan_label: TIER_LABELS[previousPlan],
        new_plan_label: TIER_LABELS[newPlan],
      },
    })

    return NextResponse.json({
      success: true,
      previous_plan: previousPlan,
      new_plan: newPlan,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
