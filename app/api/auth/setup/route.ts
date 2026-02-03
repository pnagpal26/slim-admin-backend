import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword, createAdminToken, ADMIN_COOKIE_NAME } from '@/lib/auth'

// GET: Validate invitation token and return invitation details
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  const { data: invitation, error } = await supabase
    .from('admin_invitations')
    .select('id, email, name, role, status, expires_at')
    .eq('token', token)
    .single()

  if (error || !invitation) {
    return NextResponse.json({ error: 'Invalid invitation token' }, { status: 404 })
  }

  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: 'Invitation already used' }, { status: 400 })
  }

  if (new Date(invitation.expires_at) < new Date()) {
    // Auto-expire
    await supabase
      .from('admin_invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id)
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
  }

  return NextResponse.json({
    invitation: { email: invitation.email, name: invitation.name, role: invitation.role },
  })
}

// POST: Accept invitation — create admin user account
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const { data: invitation, error: invError } = await supabase
      .from('admin_invitations')
      .select('id, email, name, role, status, expires_at, invited_by')
      .eq('token', token)
      .single()

    if (invError || !invitation) {
      return NextResponse.json({ error: 'Invalid invitation token' }, { status: 404 })
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: 'Invitation already used' }, { status: 400 })
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('admin_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id)
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 })
    }

    // Check if email already has an admin account
    const { data: existing } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', invitation.email.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const password_hash = await hashPassword(password)

    const { data: admin, error: createError } = await supabase
      .from('admin_users')
      .insert({
        email: invitation.email.toLowerCase(),
        name: invitation.name,
        password_hash,
        role: invitation.role,
        is_active: true,
        last_login_at: new Date().toISOString(),
      })
      .select('id, email, name, role')
      .single()

    if (createError) {
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    // Mark invitation as accepted
    await supabase
      .from('admin_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id)

    // Log the action
    await supabase.from('admin_actions').insert({
      admin_user_id: admin.id,
      action_type: 'account_setup',
      details: { invited_by: invitation.invited_by },
    })

    const jwtToken = createAdminToken(admin.id, admin.role, admin.email)

    const response = NextResponse.json({
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    })

    response.cookies.set(ADMIN_COOKIE_NAME, jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
