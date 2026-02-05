export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  console.log('[DELETE] ========== DELETE CUSTOMER REQUEST ==========')

  try {
    const admin = requireRole(req, 'delete_customer')
    console.log(`[DELETE] Admin ${admin.adminId} authorized`)

    const body = await req.json()
    console.log('[DELETE] Request body:', JSON.stringify(body))
    const { teamId, confirmName, reason } = body

    // Validate required fields
    if (!teamId || !confirmName || !reason) {
      console.log('[DELETE] Validation failed: missing required fields')
      return NextResponse.json(
        { error: 'teamId, confirmName, and reason are required' },
        { status: 400 }
      )
    }

    if (reason.trim().length < 3) {
      console.log('[DELETE] Validation failed: reason too short')
      return NextResponse.json({ error: 'Reason must be at least 3 characters' }, { status: 400 })
    }

    // Fetch team data for validation and logging
    console.log(`[DELETE] Fetching team ${teamId}`)
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('id', teamId)
      .maybeSingle()

    if (teamError) {
      console.error('[DELETE] Team fetch error:', teamError)
      return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 })
    }

    if (!team) {
      console.log('[DELETE] Team not found - may have been already deleted')
      return NextResponse.json({ error: 'Customer not found or already deleted' }, { status: 404 })
    }

    console.log(`[DELETE] Found team: ${team.name} (${team.id})`)

    // Verify confirmName matches exactly
    if (confirmName !== team.name) {
      console.log(`[DELETE] Name mismatch: "${confirmName}" !== "${team.name}"`)
      return NextResponse.json(
        { error: `Confirmation name does not match. Expected "${team.name}", got "${confirmName}"` },
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

    console.log(`[DELETE] Team has ${userCount} users and ${lockboxCount} lockboxes`)

    // Get lockbox IDs for audit_log deletion
    const { data: lockboxes, error: lockboxFetchError } = await supabase
      .from('lockboxes')
      .select('id')
      .eq('team_id', teamId)

    if (lockboxFetchError) {
      console.error('[DELETE] Failed to fetch lockbox IDs:', lockboxFetchError)
    }

    const lockboxIds = lockboxes?.map((l) => l.id) || []
    console.log(`[DELETE] Lockbox IDs to clean up: ${lockboxIds.length > 0 ? lockboxIds.join(', ') : 'none'}`)

    // Get user IDs early for later cleanup
    const { data: users, error: userFetchError } = await supabase
      .from('users')
      .select('id')
      .eq('team_id', teamId)

    if (userFetchError) {
      console.error('[DELETE] Failed to fetch user IDs:', userFetchError)
    }

    const userIdList = users?.map((u) => u.id) || []
    console.log(`[DELETE] User IDs to clean up: ${userIdList.length > 0 ? userIdList.join(', ') : 'none'}`)

    // Log action BEFORE deletion
    console.log('[DELETE] Logging admin action...')
    try {
      await logAdminAction(admin.adminId, 'delete_customer', {
        targetTeamId: teamId,
        reason: reason.trim(),
        details: {
          team_name: team.name,
          user_count: userCount || 0,
          lockbox_count: lockboxCount || 0,
        },
      })
      console.log('[DELETE] Admin action logged')
    } catch (logError) {
      console.error('[DELETE] Failed to log admin action:', logError)
      // Continue anyway - don't block delete due to logging failure
    }

    // Execute deletions in order (per foreign key constraints)
    console.log('[DELETE] ========== STARTING DELETIONS ==========')

    // 1. Set error_log.team_id = NULL
    console.log('[DELETE] Step 1: Nullifying error_log.team_id...')
    const { data: errorLogData, error: errorLogError, count: errorLogCount } = await supabase
      .from('error_log')
      .update({ team_id: null })
      .eq('team_id', teamId)
      .select()
    console.log(`[DELETE] Step 1 result: ${errorLogData?.length || 0} rows updated`)
    if (errorLogError) {
      console.error('[DELETE] Step 1 FAILED:', JSON.stringify(errorLogError))
      return NextResponse.json({ error: `Step 1 (error_log): ${errorLogError.message}` }, { status: 500 })
    }

    // 2. Delete audit_log entries
    console.log('[DELETE] Step 2: Deleting audit_log entries...')
    if (lockboxIds.length > 0) {
      const { data: auditData, error: auditLogError } = await supabase
        .from('audit_log')
        .delete()
        .in('lockbox_id', lockboxIds)
        .select()
      console.log(`[DELETE] Step 2 result: ${auditData?.length || 0} rows deleted`)
      if (auditLogError) {
        console.error('[DELETE] Step 2 FAILED:', JSON.stringify(auditLogError))
        return NextResponse.json({ error: `Step 2 (audit_log): ${auditLogError.message}` }, { status: 500 })
      }
    } else {
      console.log('[DELETE] Step 2: Skipped (no lockboxes)')
    }

    // 3. Delete photos
    console.log('[DELETE] Step 3: Deleting photos...')
    if (lockboxIds.length > 0) {
      const { data: photosData, error: photosError } = await supabase
        .from('photos')
        .delete()
        .in('lockbox_id', lockboxIds)
        .select()
      console.log(`[DELETE] Step 3 result: ${photosData?.length || 0} rows deleted`)
      if (photosError) {
        console.error('[DELETE] Step 3 FAILED:', JSON.stringify(photosError))
        return NextResponse.json({ error: `Step 3 (photos): ${photosError.message}` }, { status: 500 })
      }
    } else {
      console.log('[DELETE] Step 3: Skipped (no lockboxes)')
    }

    // 4. Delete lockboxes
    console.log('[DELETE] Step 4: Deleting lockboxes...')
    const { data: lockboxData, error: lockboxError } = await supabase
      .from('lockboxes')
      .delete()
      .eq('team_id', teamId)
      .select()
    console.log(`[DELETE] Step 4 result: ${lockboxData?.length || 0} rows deleted`)
    if (lockboxError) {
      console.error('[DELETE] Step 4 FAILED:', JSON.stringify(lockboxError))
      return NextResponse.json({ error: `Step 4 (lockboxes): ${lockboxError.message}` }, { status: 500 })
    }

    // 5. Delete invitations
    console.log('[DELETE] Step 5: Deleting invitations...')
    const { data: invData, error: invitationError } = await supabase
      .from('invitations')
      .delete()
      .eq('team_id', teamId)
      .select()
    console.log(`[DELETE] Step 5 result: ${invData?.length || 0} rows deleted`)
    if (invitationError) {
      console.error('[DELETE] Step 5 FAILED:', JSON.stringify(invitationError))
      return NextResponse.json({ error: `Step 5 (invitations): ${invitationError.message}` }, { status: 500 })
    }

    // 6. Delete password_reset_tokens
    console.log('[DELETE] Step 6: Deleting password_reset_tokens...')
    if (userIdList.length > 0) {
      const { data: prtData, error: resetTokensError } = await supabase
        .from('password_reset_tokens')
        .delete()
        .in('user_id', userIdList)
        .select()
      console.log(`[DELETE] Step 6 result: ${prtData?.length || 0} rows deleted`)
      if (resetTokensError) {
        console.error('[DELETE] Step 6 FAILED:', JSON.stringify(resetTokensError))
        return NextResponse.json({ error: `Step 6 (password_reset_tokens): ${resetTokensError.message}` }, { status: 500 })
      }
    } else {
      console.log('[DELETE] Step 6: Skipped (no users)')
    }

    // 7. Delete email_verification_tokens
    console.log('[DELETE] Step 7: Deleting email_verification_tokens...')
    if (userIdList.length > 0) {
      const { data: evtData, error: verifyTokensError } = await supabase
        .from('email_verification_tokens')
        .delete()
        .in('user_id', userIdList)
        .select()
      console.log(`[DELETE] Step 7 result: ${evtData?.length || 0} rows deleted`)
      if (verifyTokensError) {
        console.error('[DELETE] Step 7 FAILED:', JSON.stringify(verifyTokensError))
        return NextResponse.json({ error: `Step 7 (email_verification_tokens): ${verifyTokensError.message}` }, { status: 500 })
      }
    } else {
      console.log('[DELETE] Step 7: Skipped (no users)')
    }

    // 8. Nullify admin_actions.target_user_id
    console.log('[DELETE] Step 8: Nullifying admin_actions.target_user_id...')
    if (userIdList.length > 0) {
      const { data: aaUserData, error: adminActionsUserError } = await supabase
        .from('admin_actions')
        .update({ target_user_id: null })
        .in('target_user_id', userIdList)
        .select()
      console.log(`[DELETE] Step 8 result: ${aaUserData?.length || 0} rows updated`)
      if (adminActionsUserError) {
        console.error('[DELETE] Step 8 FAILED:', JSON.stringify(adminActionsUserError))
        return NextResponse.json({ error: `Step 8 (admin_actions.target_user_id): ${adminActionsUserError.message}` }, { status: 500 })
      }
    } else {
      console.log('[DELETE] Step 8: Skipped (no users)')
    }

    // 9. Delete users
    console.log('[DELETE] Step 9: Deleting users...')
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .delete()
      .eq('team_id', teamId)
      .select()
    console.log(`[DELETE] Step 9 result: ${usersData?.length || 0} rows deleted`)
    if (usersError) {
      console.error('[DELETE] Step 9 FAILED:', JSON.stringify(usersError))
      return NextResponse.json({ error: `Step 9 (users): ${usersError.message}` }, { status: 500 })
    }

    // 10. Delete stripe_customers
    console.log('[DELETE] Step 10: Deleting stripe_customers...')
    const { data: stripeData, error: stripeError } = await supabase
      .from('stripe_customers')
      .delete()
      .eq('team_id', teamId)
      .select()
    console.log(`[DELETE] Step 10 result: ${stripeData?.length || 0} rows deleted`)
    if (stripeError) {
      console.error('[DELETE] Step 10 FAILED:', JSON.stringify(stripeError))
      return NextResponse.json({ error: `Step 10 (stripe_customers): ${stripeError.message}` }, { status: 500 })
    }

    // 11. Nullify admin_actions.target_team_id
    console.log('[DELETE] Step 11: Nullifying admin_actions.target_team_id...')
    const { data: aaTeamData, error: adminActionsError } = await supabase
      .from('admin_actions')
      .update({ target_team_id: null })
      .eq('target_team_id', teamId)
      .select()
    console.log(`[DELETE] Step 11 result: ${aaTeamData?.length || 0} rows updated`)
    if (adminActionsError) {
      console.error('[DELETE] Step 11 FAILED:', JSON.stringify(adminActionsError))
      return NextResponse.json({ error: `Step 11 (admin_actions.target_team_id): ${adminActionsError.message}` }, { status: 500 })
    }

    // 12. Delete team
    console.log('[DELETE] Step 12: Deleting team...')
    const { data: teamData, error: deleteTeamError } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId)
      .select()
    console.log(`[DELETE] Step 12 result: ${teamData?.length || 0} rows deleted`)
    if (deleteTeamError) {
      console.error('[DELETE] Step 12 FAILED:', JSON.stringify(deleteTeamError))
      return NextResponse.json({ error: `Step 12 (team): ${deleteTeamError.message}` }, { status: 500 })
    }

    // Verify deletion
    console.log('[DELETE] Verifying team was deleted...')
    const { data: checkTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('id', teamId)
      .single()

    if (checkTeam) {
      console.error('[DELETE] CRITICAL: Team still exists after deletion!')
      return NextResponse.json({ error: 'Team deletion failed - team still exists' }, { status: 500 })
    }

    const elapsed = Date.now() - startTime
    console.log(`[DELETE] ========== SUCCESS in ${elapsed}ms ==========`)

    // Revalidate caches
    revalidatePath('/customers')
    revalidatePath(`/customers/${teamId}`)

    return NextResponse.json({
      success: true,
      deleted_team: team.name,
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[DELETE] ========== UNEXPECTED ERROR after ${elapsed}ms ==========`)
    console.error('[DELETE] Error:', error)
    if (error instanceof Error) {
      console.error('[DELETE] Message:', error.message)
      console.error('[DELETE] Stack:', error.stack)
      return NextResponse.json({ error: `Unexpected error: ${error.message}` }, { status: 500 })
    }
    return handleApiError(error)
  }
}
