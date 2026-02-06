export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyPassword, createAdminToken, ADMIN_COOKIE_NAME } from '@/lib/auth'
import { verifyCaptcha } from '@/lib/captcha'

const CAPTCHA_THRESHOLD = 3
const LOCKOUT_THRESHOLD = 5
const LOCKOUT_MINUTES = 15

export async function POST(req: NextRequest) {
  try {
    const { email, password, captchaToken } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check login attempts for this email
    const { data: attempt } = await supabase
      .from('admin_login_attempts')
      .select('*')
      .eq('email', normalizedEmail)
      .single()

    // Check if account is locked
    if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(attempt.locked_until).getTime() - Date.now()) / 60000
      )
      return NextResponse.json(
        { error: `Too many failed attempts. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`, locked: true },
        { status: 429 }
      )
    }

    // If locked_until has expired, reset the attempt record
    if (attempt?.locked_until && new Date(attempt.locked_until) <= new Date()) {
      await supabase
        .from('admin_login_attempts')
        .update({ attempt_count: 0, locked_until: null, last_attempt_at: new Date().toISOString() })
        .eq('id', attempt.id)
      attempt.attempt_count = 0
      attempt.locked_until = null
    }

    const currentAttempts = attempt?.attempt_count || 0

    // Require captcha after threshold
    if (currentAttempts >= CAPTCHA_THRESHOLD) {
      if (!captchaToken) {
        return NextResponse.json(
          { error: 'Please complete the captcha verification.', captcha_required: true },
          { status: 400 }
        )
      }
      const captchaValid = await verifyCaptcha(captchaToken)
      if (!captchaValid) {
        return NextResponse.json(
          { error: 'Captcha verification failed. Please try again.', captcha_required: true },
          { status: 400 }
        )
      }
    }

    // Find admin by email
    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('id, email, password_hash, first_name, last_name, role, is_active')
      .eq('email', normalizedEmail)
      .single()

    if (error || !admin) {
      await recordFailedAttempt(normalizedEmail, attempt)
      return NextResponse.json({ error: 'Invalid credentials', ...(await getCaptchaFlag(normalizedEmail)) }, { status: 401 })
    }

    if (!admin.is_active) {
      return NextResponse.json({ error: 'Account deactivated' }, { status: 403 })
    }

    const passwordValid = await verifyPassword(password, admin.password_hash)
    if (!passwordValid) {
      const result = await recordFailedAttempt(normalizedEmail, attempt)
      if (result.locked) {
        return NextResponse.json(
          { error: `Too many failed attempts. Your account is locked for ${LOCKOUT_MINUTES} minutes.`, locked: true },
          { status: 429 }
        )
      }
      return NextResponse.json({ error: 'Invalid credentials', ...(await getCaptchaFlag(normalizedEmail)) }, { status: 401 })
    }

    // Successful login — reset attempt counter
    if (attempt) {
      await supabase
        .from('admin_login_attempts')
        .update({ attempt_count: 0, locked_until: null, last_attempt_at: new Date().toISOString() })
        .eq('id', attempt.id)
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
      admin: { id: admin.id, email: admin.email, first_name: admin.first_name, last_name: admin.last_name, role: admin.role },
    })

    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8, // 8 hours
      path: '/',
    })

    return response
  } catch (err) {
    console.error('[login] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function recordFailedAttempt(
  email: string,
  existing: { id: string; attempt_count: number } | null
): Promise<{ locked: boolean }> {
  const newCount = (existing?.attempt_count || 0) + 1
  const locked = newCount >= LOCKOUT_THRESHOLD
  const lockedUntil = locked
    ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
    : null

  if (existing) {
    await supabase
      .from('admin_login_attempts')
      .update({
        attempt_count: newCount,
        locked_until: lockedUntil,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('admin_login_attempts').insert({
      email,
      attempt_count: newCount,
      locked_until: lockedUntil,
      last_attempt_at: new Date().toISOString(),
    })
  }

  return { locked }
}

async function getCaptchaFlag(email: string): Promise<{ captcha_required?: boolean }> {
  const { data } = await supabase
    .from('admin_login_attempts')
    .select('attempt_count')
    .eq('email', email)
    .single()
  if (data && data.attempt_count >= CAPTCHA_THRESHOLD) {
    return { captcha_required: true }
  }
  return {}
}
