export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'edit_admin')
    const { adminUserId, firstName, lastName, phone } = await req.json()

    if (!adminUserId || !firstName) {
      return NextResponse.json({ error: 'adminUserId and firstName are required' }, { status: 400 })
    }

    // Cannot edit yourself through this route
    if (adminUserId === admin.adminId) {
      return NextResponse.json({ error: 'Cannot edit your own account through admin management' }, { status: 400 })
    }

    const { data: target, error: fetchErr } = await supabase
      .from('admin_users')
      .select('id, email, first_name, last_name, phone, role')
      .eq('id', adminUserId)
      .single()

    if (fetchErr || !target) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
    }

    const { error: updateErr } = await supabase
      .from('admin_users')
      .update({
        first_name: firstName.trim(),
        last_name: (lastName || '').trim(),
        phone: (phone || '').trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adminUserId)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to update admin user' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'edit_admin', {
      details: {
        edited_id: target.id,
        edited_email: target.email,
        changes: {
          first_name: { from: target.first_name, to: firstName.trim() },
          last_name: { from: target.last_name, to: (lastName || '').trim() },
          phone: { from: target.phone, to: (phone || '').trim() || null },
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
