export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'
import { sendAdminInviteEmail } from '@/lib/email'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'invite_admin')
    const { email, firstName, lastName, phone, role } = await req.json()

    if (!email || !firstName || !role || !phone) {
      return NextResponse.json(
        { error: 'Email, first name, phone, and role are required' },
        { status: 400 }
      )
    }

    // Validate phone: must be 7-15 digits, optional leading +, optional spaces/dashes/parens
    const phoneClean = phone.trim()
    const phoneDigits = phoneClean.replace(/[\s\-().+]/g, '')
    if (phoneDigits.length < 7 || phoneDigits.length > 15 || !/^\+?[\d\s\-().]+$/.test(phoneClean)) {
      return NextResponse.json(
        { error: 'Phone must be a valid number (7-15 digits, e.g. +1 416-555-0199)' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Validate role — Super Admin cannot be invited, only L1/L2
    if (role !== 'support_l1' && role !== 'support_l2') {
      return NextResponse.json(
        { error: 'Role must be support_l1 or support_l2' },
        { status: 400 }
      )
    }

    // Check if an admin with this email already exists
    const { data: existing } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', normalizedEmail)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'An admin account with this email already exists' },
        { status: 409 }
      )
    }

    // Check for an existing pending, non-expired invitation
    const { data: existingInv } = await supabase
      .from('admin_invitations')
      .select('id, expires_at')
      .eq('email', normalizedEmail)
      .eq('status', 'pending')

    const now = new Date()
    const activeInv = (existingInv || []).find(
      (inv) => new Date(inv.expires_at) > now
    )

    if (activeInv) {
      return NextResponse.json(
        { error: 'A pending invitation for this email already exists' },
        { status: 409 }
      )
    }

    // Generate secure token and create invitation
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours

    const { data: invitation, error: insertErr } = await supabase
      .from('admin_invitations')
      .insert({
        email: normalizedEmail,
        first_name: firstName.trim(),
        last_name: (lastName || '').trim(),
        phone: (phone || '').trim() || null,
        role,
        token,
        invited_by: admin.adminId,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      })
      .select('id, email, first_name, last_name, role, expires_at')
      .single()

    if (insertErr) {
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
    }

    // Build the setup URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
    const setupUrl = `${appUrl}/setup?token=${token}`

    // Send invitation email
    const emailResult = await sendAdminInviteEmail({
      to: normalizedEmail,
      inviteeName: firstName.trim(),
      role,
      setupUrl,
    })

    if (!emailResult.success) {
      console.error(`[Admin Invite] Email failed for ${normalizedEmail}:`, emailResult.error)
    }

    await logAdminAction(admin.adminId, 'invite_admin', {
      details: {
        invited_email: normalizedEmail,
        invited_name: [firstName, lastName].filter(Boolean).join(' ').trim(),
        invited_role: role,
        invitation_id: invitation.id,
        email_sent: emailResult.success,
        ...(emailResult.error ? { email_error: emailResult.error } : {}),
      },
    })

    return NextResponse.json({
      invitation,
      email_sent: emailResult.success,
      ...(emailResult.error ? { email_warning: 'Invitation created but email delivery failed. Share the setup link manually.' } : {}),
      ...(!emailResult.success ? { setup_url: setupUrl } : {}),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
