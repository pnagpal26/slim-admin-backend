export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'reactivate_admin')
    const { adminUserId } = await req.json()

    if (!adminUserId) {
      return NextResponse.json({ error: 'adminUserId is required' }, { status: 400 })
    }

    const { data: target, error: fetchErr } = await supabase
      .from('admin_users')
      .select('id, email, first_name, last_name, role, is_active')
      .eq('id', adminUserId)
      .single()

    if (fetchErr || !target) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    if (target.is_active) {
      return NextResponse.json({ error: 'Admin user is already active' }, { status: 400 })
    }

    const { error: updateErr } = await supabase
      .from('admin_users')
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adminUserId)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to reactivate admin user' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'reactivate_admin', {
      details: {
        reactivated_id: target.id,
        reactivated_email: target.email,
        reactivated_name: [target.first_name, target.last_name].filter(Boolean).join(' '),
        reactivated_role: target.role,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
