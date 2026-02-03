export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'mark_error_resolved')
    const { errorId } = await req.json()

    if (!errorId) {
      return NextResponse.json({ error: 'errorId is required' }, { status: 400 })
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('error_log')
      .select('id, status, error_message, endpoint, team_id')
      .eq('id', errorId)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Error not found' }, { status: 404 })
    }

    if (existing.status === 'resolved') {
      return NextResponse.json({ error: 'Already resolved' }, { status: 400 })
    }

    const { error: updateErr } = await supabase
      .from('error_log')
      .update({
        status: 'resolved',
        resolved_by: admin.adminId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', errorId)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to resolve error' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'resolve_error', {
      details: {
        error_id: errorId,
        error_message: existing.error_message,
        endpoint: existing.endpoint,
      },
      targetTeamId: existing.team_id || undefined,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
