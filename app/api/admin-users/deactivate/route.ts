export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'deactivate_admin')
    const { adminUserId } = await req.json()

    if (!adminUserId) {
      return NextResponse.json({ error: 'adminUserId is required' }, { status: 400 })
    }

    // Cannot deactivate yourself
    if (adminUserId === admin.adminId) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account' },
        { status: 400 }
      )
    }

    // Fetch the target admin
    const { data: target, error: fetchErr } = await supabase
      .from('admin_users')
      .select('id, email, first_name, last_name, role, is_active')
      .eq('id', adminUserId)
      .single()

    if (fetchErr || !target) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    if (!target.is_active) {
      return NextResponse.json({ error: 'Admin user is already deactivated' }, { status: 400 })
    }

    // Cannot deactivate another super_admin
    if (target.role === 'super_admin') {
      return NextResponse.json(
        { error: 'Cannot deactivate a Super Admin account' },
        { status: 403 }
      )
    }

    const { error: updateErr } = await supabase
      .from('admin_users')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adminUserId)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to deactivate admin user' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'deactivate_admin', {
      details: {
        deactivated_id: target.id,
        deactivated_email: target.email,
        deactivated_name: [target.first_name, target.last_name].filter(Boolean).join(' '),
        deactivated_role: target.role,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
