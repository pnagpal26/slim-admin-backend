export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  try {
    const admin = requireRole(req, 'view_system_health')

    // Fetch bounces from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: bounces, error: bouncesError } = await supabase
      .from('sent_emails')
      .select('id, template_key, team_id')
      .eq('status', 'bounced')
      .gte('sent_at', twentyFourHoursAgo)

    if (bouncesError) {
      console.error('[Email Bounces Dashboard API] Error:', bouncesError)
      return NextResponse.json({ error: 'Failed to fetch bounce data' }, { status: 500 })
    }

    const allBounces = bounces || []

    // Categorize bounces
    const criticalTemplates = [
      'password_reset',
      'email_verification_resend',
      'admin_invitation',
      'team_invite'
    ]

    const billingTemplates = [
      'payment_failed',
      'trial_expiring',
      'trial_expired',
      'payment_first',
      'payment_recurring'
    ]

    const criticalCount = allBounces.filter(b =>
      criticalTemplates.includes(b.template_key)
    ).length

    const billingCount = allBounces.filter(b =>
      billingTemplates.includes(b.template_key)
    ).length

    // Count unique teams affected
    const teamsAffected = new Set(allBounces.map(b => b.team_id)).size

    return NextResponse.json({
      total_24h: allBounces.length,
      critical_24h: criticalCount,
      billing_24h: billingCount,
      teams_affected: teamsAffected,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
