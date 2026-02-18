export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

const VALID_STATUSES = ['sent', 'delivered', 'bounced', 'opened', 'clicked'] as const

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_customer_detail')
    const teamId = req.nextUrl.searchParams.get('team_id')
    const statusFilter = req.nextUrl.searchParams.get('status')

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 })
    }

    if (statusFilter && !VALID_STATUSES.includes(statusFilter as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    // Fetch all sent emails for this team (last 90 days), optionally filtered by status
    let query = supabase
      .from('sent_emails')
      .select('id, template_key, recipient, subject, sent_at, status, resend_id')
      .eq('team_id', teamId)
      .gte('sent_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('sent_at', { ascending: false })
      .limit(100)

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data: emails, error: emailsError } = await query

    if (emailsError) {
      console.error('[Customer Emails API] Error fetching emails:', emailsError)
      return NextResponse.json({ error: 'Failed to fetch email history' }, { status: 500 })
    }

    // Fetch summary counts by status (last 90 days, no status filter)
    const { data: allEmails } = await supabase
      .from('sent_emails')
      .select('id, status')
      .eq('team_id', teamId)
      .gte('sent_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

    const counts: Record<string, number> = { sent: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0 }
    allEmails?.forEach((e) => {
      if (e.status in counts) counts[e.status]++
    })
    const total = allEmails?.length || 0

    return NextResponse.json({
      emails: emails || [],
      summary: {
        total,
        by_status: counts,
        bounce_rate: total > 0 ? parseFloat(((counts.bounced / total) * 100).toFixed(2)) : 0,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
