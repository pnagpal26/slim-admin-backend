import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = verifyAdminToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { data: admin, error } = await supabase
    .from('admin_users')
    .select('id, email, name, role, is_active, last_login_at, created_at')
    .eq('id', payload.adminId)
    .single()

  if (error || !admin) {
    return NextResponse.json({ error: 'Admin user not found' }, { status: 404 })
  }

  if (!admin.is_active) {
    return NextResponse.json({ error: 'Account deactivated' }, { status: 403 })
  }

  return NextResponse.json({ admin })
}
