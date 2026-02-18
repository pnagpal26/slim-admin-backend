export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'edit_customer')
    const { teamId, userId, reason } = await req.json()

    if (!teamId || !userId || !reason) {
      return NextResponse.json(
        { error: 'teamId, userId, and reason are required' },
        { status: 400 }
      )
    }

    if (reason.trim().length < 3) {
      return NextResponse.json({ error: 'Reason must be at least 3 characters' }, { status: 400 })
    }

    // Fetch the user and verify they belong to this team
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, role, is_active, team_id')
      .eq('id', userId)
      .eq('team_id', teamId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'Member not found on this team' }, { status: 404 })
    }

    if (user.is_active) {
      return NextResponse.json({ error: 'Member is already active' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to reactivate member' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'reactivate_team_member', {
      targetTeamId: teamId,
      targetUserId: userId,
      reason: reason.trim(),
      details: { member_email: user.email, member_role: user.role },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
