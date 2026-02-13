export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 're_enable_account')
    const { teamId, reason } = await req.json()

    if (!teamId || !reason) {
      return NextResponse.json(
        { error: 'teamId and reason are required' },
        { status: 400 }
      )
    }

    if (reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'Reason must be at least 10 characters' },
        { status: 400 }
      )
    }

    // Fetch the team to verify it's suspended
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, account_status, suspended_at, suspended_reason')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (team.account_status === 'active') {
      return NextResponse.json(
        { error: 'Account is not suspended' },
        { status: 400 }
      )
    }

    // Re-enable the account
    const { error: updateError } = await supabase
      .from('teams')
      .update({
        account_status: 'active',
        re_enabled_at: new Date().toISOString(),
        re_enabled_by: admin.adminId,
        re_enable_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)

    if (updateError) {
      console.error('[re-enable] Failed to re-enable account:', updateError)
      return NextResponse.json({ error: 'Failed to re-enable account' }, { status: 500 })
    }

    // Log admin action
    await logAdminAction(admin.adminId, 're_enable_account', {
      targetTeamId: teamId,
      reason: reason.trim(),
      details: {
        team_name: team.name,
        previous_status: team.account_status,
        suspended_at: team.suspended_at,
        suspended_reason: team.suspended_reason,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Account re-enabled successfully',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
