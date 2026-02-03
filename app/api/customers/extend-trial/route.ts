export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'extend_trial')
    const { teamId, days, reason } = await req.json()

    if (!teamId || !days || !reason) {
      return NextResponse.json(
        { error: 'teamId, days, and reason are required' },
        { status: 400 }
      )
    }

    const numDays = parseInt(days)
    if (isNaN(numDays) || numDays < 1 || numDays > 365) {
      return NextResponse.json(
        { error: 'Days must be between 1 and 365' },
        { status: 400 }
      )
    }

    if (reason.trim().length < 3) {
      return NextResponse.json(
        { error: 'Reason must be at least 3 characters' },
        { status: 400 }
      )
    }

    // Fetch the team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, plan_tier, trial_ends_at, created_at')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (team.plan_tier !== 'free_trial') {
      return NextResponse.json(
        { error: 'Can only extend trial for accounts on free trial' },
        { status: 400 }
      )
    }

    // Calculate new trial end date
    const currentEnd = team.trial_ends_at
      ? new Date(team.trial_ends_at)
      : new Date(new Date(team.created_at).getTime() + 14 * 24 * 60 * 60 * 1000)

    const newEnd = new Date(currentEnd.getTime() + numDays * 24 * 60 * 60 * 1000)

    // Update team
    const { error: updateError } = await supabase
      .from('teams')
      .update({
        trial_ends_at: newEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to extend trial' }, { status: 500 })
    }

    // Log admin action
    await logAdminAction(admin.adminId, 'extend_trial', {
      targetTeamId: teamId,
      reason: reason.trim(),
      details: {
        days_added: numDays,
        previous_end: currentEnd.toISOString(),
        new_end: newEnd.toISOString(),
        team_name: team.name,
      },
    })

    return NextResponse.json({
      success: true,
      trial_ends_at: newEnd.toISOString(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
