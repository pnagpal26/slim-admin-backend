export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_admin_users')

    const { data: admins, error } = await supabase
      .from('admin_users')
      .select('id, email, first_name, last_name, role, is_active, last_login_at, created_at')
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch admin users' }, { status: 500 })
    }

    // Fetch pending invitations
    const { data: invitations } = await supabase
      .from('admin_invitations')
      .select('id, email, first_name, last_name, role, status, expires_at, created_at, invited_by')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    // Filter out expired invitations client-side
    const now = new Date()
    const activeInvitations = (invitations || []).filter(
      (inv) => new Date(inv.expires_at) > now
    )

    return NextResponse.json({
      admins: admins || [],
      pending_invitations: activeInvitations,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
