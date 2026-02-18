export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

const SUSPEND_REASONS: Record<string, string> = {
  chargeback:   'Chargeback / Dispute',
  fraud:        'Fraud',
  abuse:        'Abuse / Policy Violation',
  non_payment:  'Non-Payment',
  other:        'Other',
}

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'edit_customer')
    const { teamId, reason, notes } = await req.json()

    if (!teamId || !reason) {
      return NextResponse.json({ error: 'teamId and reason are required' }, { status: 400 })
    }

    if (!SUSPEND_REASONS[reason]) {
      return NextResponse.json({ error: 'Invalid suspension reason' }, { status: 400 })
    }

    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, account_status')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (team.account_status !== 'active') {
      return NextResponse.json({ error: 'Account is already suspended or inactive' }, { status: 400 })
    }

    const suspendedReason = notes?.trim()
      ? `${SUSPEND_REASONS[reason]}: ${notes.trim()}`
      : SUSPEND_REASONS[reason]

    const now = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('teams')
      .update({
        account_status: 'suspended',
        suspended_at: now,
        suspended_reason: suspendedReason,
        suspended_by_admin_id: admin.adminId,
        updated_at: now,
      })
      .eq('id', teamId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to suspend account' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'suspend_account', {
      targetTeamId: teamId,
      reason: suspendedReason,
      details: {
        team_name: team.name,
        reason_key: reason,
        reason_label: SUSPEND_REASONS[reason],
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
