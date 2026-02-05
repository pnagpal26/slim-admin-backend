export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'delete_customer')
    const { teamId, confirmName, reason } = await req.json()

    // Validate required fields
    if (!teamId || !confirmName || !reason) {
      return NextResponse.json(
        { error: 'teamId, confirmName, and reason are required' },
        { status: 400 }
      )
    }

    if (reason.trim().length < 3) {
      return NextResponse.json({ error: 'Reason must be at least 3 characters' }, { status: 400 })
    }

    // Fetch team data for validation and logging
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Verify confirmName matches exactly
    if (confirmName !== team.name) {
      return NextResponse.json(
        { error: 'Confirmation name does not match team name' },
        { status: 400 }
      )
    }

    // Get counts for audit log
    const { count: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)

    const { count: lockboxCount } = await supabase
      .from('lockboxes')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)

    // Get lockbox IDs for audit_log deletion
    const { data: lockboxes } = await supabase
      .from('lockboxes')
      .select('id')
      .eq('team_id', teamId)

    const lockboxIds = lockboxes?.map((l) => l.id) || []

    // Log action BEFORE deletion (in case deletion fails, we still have a record of the attempt)
    await logAdminAction(admin.adminId, 'delete_customer', {
      targetTeamId: teamId,
      reason: reason.trim(),
      details: {
        team_name: team.name,
        user_count: userCount || 0,
        lockbox_count: lockboxCount || 0,
      },
    })

    // Execute deletions in order (per foreign key constraints)

    // 1. Set error_log.team_id = NULL (preserve error logs)
    await supabase
      .from('error_log')
      .update({ team_id: null })
      .eq('team_id', teamId)

    // 2. Delete audit_log entries via lockbox_ids
    if (lockboxIds.length > 0) {
      await supabase
        .from('audit_log')
        .delete()
        .in('lockbox_id', lockboxIds)
    }

    // 3. Delete lockboxes
    await supabase
      .from('lockboxes')
      .delete()
      .eq('team_id', teamId)

    // 4. Delete invitations
    await supabase
      .from('invitations')
      .delete()
      .eq('team_id', teamId)

    // 5. Delete users
    await supabase
      .from('users')
      .delete()
      .eq('team_id', teamId)

    // 6. Delete stripe_customers
    await supabase
      .from('stripe_customers')
      .delete()
      .eq('team_id', teamId)

    // 7. Delete team
    const { error: deleteTeamError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId)

    if (deleteTeamError) {
      return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted_team: team.name,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
