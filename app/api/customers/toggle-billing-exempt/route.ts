export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'edit_customer')
    const { teamId, billingExempt, reason } = await req.json()

    if (!teamId || typeof billingExempt !== 'boolean' || !reason) {
      return NextResponse.json(
        { error: 'teamId, billingExempt, and reason are required' },
        { status: 400 }
      )
    }

    if (reason.trim().length < 3) {
      return NextResponse.json({ error: 'Reason must be at least 3 characters' }, { status: 400 })
    }

    // Fetch current state
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, billing_exempt')
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (team.billing_exempt === billingExempt) {
      return NextResponse.json(
        { error: `Billing exempt is already set to ${billingExempt}` },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabase
      .from('teams')
      .update({ billing_exempt: billingExempt, updated_at: new Date().toISOString() })
      .eq('id', teamId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update billing exempt status' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'toggle_billing_exempt', {
      targetTeamId: teamId,
      reason: reason.trim(),
      details: { before: team.billing_exempt, after: billingExempt },
    })

    return NextResponse.json({ success: true, billing_exempt: billingExempt })
  } catch (error) {
    return handleApiError(error)
  }
}
