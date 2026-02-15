export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  try {
    const admin = requireRole(req, 'view_customer_detail')
    const teamId = req.nextUrl.searchParams.get('team_id')

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 })
    }

    // Fetch bounced emails for this team (last 30 days)
    const { data: bounces, error: bouncesError } = await supabase
      .from('sent_emails')
      .select('id, template_key, recipient, subject, sent_at, resend_id')
      .eq('team_id', teamId)
      .eq('status', 'bounced')
      .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('sent_at', { ascending: false })
      .limit(50)

    if (bouncesError) {
      console.error('[Bounced Emails API] Error fetching bounces:', bouncesError)
      return NextResponse.json({ error: 'Failed to fetch bounced emails' }, { status: 500 })
    }

    // Calculate summary stats (last 30 days)
    const { data: totalEmails } = await supabase
      .from('sent_emails')
      .select('id, status')
      .eq('team_id', teamId)
      .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    const bouncedCount = bounces?.length || 0
    const totalCount = totalEmails?.length || 0
    const bounceRate = totalCount > 0 ? ((bouncedCount / totalCount) * 100).toFixed(2) : '0.00'

    // Group bounces by template type for quick insights
    const byTemplate: Record<string, number> = {}
    bounces?.forEach((bounce) => {
      byTemplate[bounce.template_key] = (byTemplate[bounce.template_key] || 0) + 1
    })

    // Identify problematic email addresses (multiple bounces)
    const byRecipient: Record<string, number> = {}
    bounces?.forEach((bounce) => {
      byRecipient[bounce.recipient] = (byRecipient[bounce.recipient] || 0) + 1
    })
    const problematicEmails = Object.entries(byRecipient)
      .filter(([_, count]) => count > 1)
      .map(([email, count]) => ({ email, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      bounces: bounces || [],
      summary: {
        bounced_count: bouncedCount,
        total_sent: totalCount,
        bounce_rate: parseFloat(bounceRate),
        by_template: byTemplate,
        problematic_emails: problematicEmails,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
