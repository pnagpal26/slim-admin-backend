export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'delete_admin')
    const { adminUserId, reason } = await req.json()

    if (!adminUserId || !reason) {
      return NextResponse.json({ error: 'adminUserId and reason are required' }, { status: 400 })
    }

    if (reason.trim().length < 3) {
      return NextResponse.json({ error: 'Reason must be at least 3 characters' }, { status: 400 })
    }

    if (adminUserId === admin.adminId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
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
      return NextResponse.json({ error: 'Cannot delete a Super Admin account' }, { status: 403 })
    }

    if (target.is_active) {
      return NextResponse.json({ error: 'Admin user must be deactivated before deletion' }, { status: 400 })
    }

    // Delete related admin_actions first (FK constraint)
    await supabase
      .from('admin_actions')
      .delete()
      .eq('admin_user_id', adminUserId)

    const { error: deleteErr } = await supabase
      .from('admin_users')
      .delete()
      .eq('id', adminUserId)

    if (deleteErr) {
      console.error('[delete_admin] Delete error:', deleteErr)
      return NextResponse.json({ error: 'Failed to delete admin user' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'delete_admin', {
      reason: reason.trim(),
      details: {
        deleted_id: target.id,
        deleted_email: target.email,
        deleted_name: [target.first_name, target.last_name].filter(Boolean).join(' '),
        deleted_role: target.role,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
