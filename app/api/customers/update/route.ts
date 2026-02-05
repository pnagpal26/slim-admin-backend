export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'
import { toTitleCase, formatTeamName } from '@/lib/utils/format'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'edit_customer')
    const { teamId, teamName, leaderName, leaderEmail, leaderPhone, reason } = await req.json()

    // Validate required fields
    if (!teamId || !teamName || !leaderName || !leaderEmail || !reason) {
      return NextResponse.json(
        { error: 'teamId, teamName, leaderName, leaderEmail, and reason are required' },
        { status: 400 }
      )
    }

    if (teamName.trim().length < 1) {
      return NextResponse.json({ error: 'Team name cannot be empty' }, { status: 400 })
    }

    if (reason.trim().length < 3) {
      return NextResponse.json({ error: 'Reason must be at least 3 characters' }, { status: 400 })
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(leaderEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Fetch current team data
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Fetch current leader
    const { data: currentLeader, error: leaderError } = await supabase
      .from('users')
      .select('id, name, email, phone, role')
      .eq('team_id', teamId)
      .in('role', ['team_leader', 'solo_agent'])
      .single()

    if (leaderError || !currentLeader) {
      return NextResponse.json({ error: 'Team leader not found' }, { status: 404 })
    }

    // Store before state for logging
    const beforeState = {
      team_name: team.name,
      leader_name: currentLeader.name,
      leader_email: currentLeader.email,
      leader_phone: currentLeader.phone,
    }

    const afterState = {
      team_name: toTitleCase(teamName),
      leader_name: toTitleCase(leaderName),
      leader_email: leaderEmail.trim().toLowerCase(),
      leader_phone: leaderPhone?.trim() || null,
    }

    // Update team name
    const { error: updateTeamError } = await supabase
      .from('teams')
      .update({
        name: afterState.team_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId)

    if (updateTeamError) {
      return NextResponse.json({ error: 'Failed to update team' }, { status: 500 })
    }

    // Update leader
    const { error: updateLeaderError } = await supabase
      .from('users')
      .update({
        name: afterState.leader_name,
        email: afterState.leader_email,
        phone: afterState.leader_phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentLeader.id)

    if (updateLeaderError) {
      return NextResponse.json({ error: 'Failed to update leader' }, { status: 500 })
    }

    // Log admin action
    await logAdminAction(admin.adminId, 'edit_customer', {
      targetTeamId: teamId,
      targetUserId: currentLeader.id,
      reason: reason.trim(),
      details: {
        before: beforeState,
        after: afterState,
      },
    })

    // Format team name for display
    const teamNameFormatted = formatTeamName(afterState.team_name)

    return NextResponse.json({
      success: true,
      team_name: teamNameFormatted.displayName,
      team_name_full: teamNameFormatted.fullName,
      team_name_has_suffix: teamNameFormatted.hasSuffix,
      leader: {
        id: currentLeader.id,
        name: afterState.leader_name,
        email: afterState.leader_email,
        phone: afterState.leader_phone,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
