export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'change_role_admin')
    const { adminUserId, newRole } = await req.json()

    if (!adminUserId || !newRole) {
      return NextResponse.json({ error: 'adminUserId and newRole are required' }, { status: 400 })
    }

    if (newRole !== 'support_l1' && newRole !== 'support_l2') {
      return NextResponse.json({ error: 'newRole must be support_l1 or support_l2' }, { status: 400 })
    }

    if (adminUserId === admin.adminId) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
    }

    const { data: target, error: fetchErr } = await supabase
      .from('admin_users')
      .select('id, email, first_name, last_name, role, is_active')
      .eq('id', adminUserId)
      .single()

    if (fetchErr || !target) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    if (target.role === 'super_admin') {
      return NextResponse.json({ error: 'Cannot change a Super Admin role' }, { status: 403 })
    }

    if (target.role === newRole) {
      return NextResponse.json({ error: 'User already has this role' }, { status: 400 })
    }

    const { error: updateErr } = await supabase
      .from('admin_users')
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adminUserId)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to change role' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'change_role_admin', {
      details: {
        target_id: target.id,
        target_email: target.email,
        previous_role: target.role,
        new_role: newRole,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
