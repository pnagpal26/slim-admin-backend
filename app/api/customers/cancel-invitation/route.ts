export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'edit_customer')
    const { teamId, invitationId, reason } = await req.json()

    if (!teamId || !invitationId || !reason) {
      return NextResponse.json(
        { error: 'teamId, invitationId, and reason are required' },
        { status: 400 }
      )
    }

    if (reason.trim().length < 3) {
      return NextResponse.json({ error: 'Reason must be at least 3 characters' }, { status: 400 })
    }

    // Fetch invitation and verify it belongs to this team
    const { data: invitation, error: invError } = await supabase
      .from('invitations')
      .select('id, email, first_name, last_name, role, status, team_id')
      .eq('id', invitationId)
      .eq('team_id', teamId)
      .single()

    if (invError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found on this team' }, { status: 404 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: `Invitation is already ${invitation.status} and cannot be cancelled` },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabase
      .from('invitations')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', invitationId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to cancel invitation' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'cancel_team_invitation', {
      targetTeamId: teamId,
      reason: reason.trim(),
      details: {
        invitation_email: invitation.email,
        invitation_role: invitation.role,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
