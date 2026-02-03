export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyPassword, createAdminToken, ADMIN_COOKIE_NAME } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('id, email, password_hash, name, role, is_active')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (error || !admin) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!admin.is_active) {
      return NextResponse.json({ error: 'Account deactivated' }, { status: 403 })
    }

    const passwordValid = await verifyPassword(password, admin.password_hash)
    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Update last login
    await supabase
      .from('admin_users')
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', admin.id)

    // Log the login action
    await supabase.from('admin_actions').insert({
      admin_user_id: admin.id,
      action_type: 'login',
      details: { ip: req.headers.get('x-forwarded-for') || 'unknown' },
    })

    const token = createAdminToken(admin.id, admin.role, admin.email)

    const response = NextResponse.json({
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    })

    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8, // 8 hours
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
