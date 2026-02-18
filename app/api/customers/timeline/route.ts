export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { formatPersonName } from '@/lib/utils/format'

const FETCH_LIMIT = 150 // fetch from each source; merge window per request
const PAGE_SIZE = 25

type EventType = 'lockbox_action' | 'email_sent' | 'admin_action'

interface TimelineEvent {
  id: string
  type: EventType
  timestamp: string
  title: string
  subtitle: string | null
  actor: { name: string; email: string; role: 'customer' | 'admin' } | null
  badge: string | null   // status / action label for coloring
  metadata: Record<string, unknown>
}

// ─── Normalizers ────────────────────────────────────────────────────────────

function normalizeLockboxAction(entry: Record<string, unknown>): TimelineEvent {
  const user = entry.users as Record<string, unknown> | null
  const action = String(entry.action || '')
  const lockboxId = entry.lockbox_id_display as string | null

  const LOCKBOX_ACTION_LABELS: Record<string, string> = {
    // Current action names written by the main app
    created: 'Lockbox created',
    moved: 'Lockbox status changed',
    deleted: 'Lockbox deleted',
    reassigned: 'Lockbox reassigned',
    photo_uploaded: 'Photo uploaded',
    photo_deleted: 'Photo deleted',
    phone_verified: 'Phone verified',
    phone_changed: 'Phone number changed',
    member_removed: 'Team member removed',
    invitation_resent: 'Invitation resent',
    invitation_cancelled: 'Invitation cancelled',
    // Status-based values that may appear as actions in older DB records
    checked_out: 'Lockbox checked out',
    installed: 'Lockbox installed',
    available: 'Lockbox marked available',
    removed: 'Lockbox removed',
    in_transit: 'Lockbox in transit',
    out_of_service: 'Lockbox out of service',
    // Legacy action names
    create: 'Lockbox created',
    update: 'Lockbox updated',
    delete: 'Lockbox deleted',
    checkout: 'Lockbox checked out',
    install: 'Lockbox installed',
    status_change: 'Lockbox status changed',
    transfer: 'Lockbox transferred',
    code_view: 'Code viewed',
    code_change: 'Code changed',
  }

  // Fallback: title-case the raw action rather than showing snake_case
  const label = LOCKBOX_ACTION_LABELS[action]
    ?? action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const subtitle = lockboxId ? `Lockbox #${lockboxId}` : null

  return {
    id: `lockbox_${entry.id}`,
    type: 'lockbox_action',
    timestamp: entry.performed_at as string,
    title: label,
    subtitle,
    actor: user
      ? {
          name: [formatPersonName(user.first_name as string), formatPersonName(user.last_name as string)].filter(Boolean).join(' '),
          email: user.email as string,
          role: 'customer',
        }
      : null,
    badge: action,
    metadata: {
      action,
      action_method: entry.action_method,
      lockbox_id: entry.lockbox_id,
      details: entry.details,
    },
  }
}

function normalizeEmail(entry: Record<string, unknown>): TimelineEvent {
  const templateKey = String(entry.template_key || '').replace(/_/g, ' ')
  const status = String(entry.status || 'sent')

  const label = templateKey
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return {
    id: `email_${entry.id}`,
    type: 'email_sent',
    timestamp: entry.sent_at as string,
    title: label,
    subtitle: `To: ${entry.recipient}`,
    actor: null,
    badge: status,
    metadata: {
      template_key: entry.template_key,
      status,
      subject: entry.subject,
      recipient: entry.recipient,
      resend_id: entry.resend_id,
    },
  }
}

function normalizeAdminAction(entry: Record<string, unknown>): TimelineEvent {
  const admin = entry.admin_users as Record<string, unknown> | null
  const actionType = String(entry.action_type || '')

  const ADMIN_ACTION_LABELS: Record<string, string> = {
    change_plan: 'Plan changed',
    extend_trial: 'Trial extended',
    comp_month: 'Month comped',
    toggle_billing_exempt: 'Billing exemption toggled',
    delete_account: 'Account deleted',
    re_enable_account: 'Account re-enabled',
    suspend_account: 'Account suspended',
    deactivate_team_member: 'Team member deactivated',
    reactivate_team_member: 'Team member reactivated',
    cancel_invitation: 'Invitation cancelled',
    update_customer: 'Account info updated',
    admin_login: 'Admin logged in',
    admin_logout: 'Admin logged out',
  }

  const label = ADMIN_ACTION_LABELS[actionType] || actionType.replace(/_/g, ' ')
  const reason = entry.reason as string | null
  const details = entry.details as Record<string, unknown> | null

  let subtitle: string | null = null
  if (reason) {
    subtitle = `Reason: ${reason}`
  } else if (details?.previous_plan_label && details?.new_plan_label) {
    subtitle = `${details.previous_plan_label} → ${details.new_plan_label}`
  }

  return {
    id: `admin_${entry.id}`,
    type: 'admin_action',
    timestamp: entry.performed_at as string,
    title: label,
    subtitle,
    actor: admin
      ? {
          name: [formatPersonName(admin.first_name as string), formatPersonName(admin.last_name as string)].filter(Boolean).join(' '),
          email: admin.email as string,
          role: 'admin',
        }
      : null,
    badge: actionType,
    metadata: {
      action_type: actionType,
      reason,
      details,
    },
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_customer_detail')

    const teamId = req.nextUrl.searchParams.get('team_id')
    const page = parseInt(req.nextUrl.searchParams.get('page') || '0', 10)
    // Default to last 30 days if no since param provided
    const sinceParam = req.nextUrl.searchParams.get('since')
    const since = sinceParam || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    if (!teamId) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 })
    }

    // 1. Get lockbox IDs for this team (needed to join audit_log)
    const { data: lockboxRows } = await supabase
      .from('lockboxes')
      .select('id, lockbox_id')
      .eq('team_id', teamId)

    const lockboxIdMap: Record<string, string> = {}
    for (const lb of lockboxRows || []) {
      lockboxIdMap[lb.id] = lb.lockbox_id
    }
    const lockboxUuids = Object.keys(lockboxIdMap)

    // 2. Fetch all three sources in parallel
    const [auditResult, emailResult, adminResult] = await Promise.all([
      // Lockbox audit events
      lockboxUuids.length > 0
        ? supabase
            .from('audit_log')
            .select(`
              id, action, performed_at, action_method, details, lockbox_id,
              users:performed_by(id, first_name, last_name, email)
            `)
            .in('lockbox_id', lockboxUuids)
            .gte('performed_at', since)
            .order('performed_at', { ascending: false })
            .limit(FETCH_LIMIT)
        : Promise.resolve({ data: [], error: null }),

      // Sent emails
      supabase
        .from('sent_emails')
        .select('id, template_key, recipient, subject, sent_at, status, resend_id')
        .eq('team_id', teamId)
        .gte('sent_at', since)
        .order('sent_at', { ascending: false })
        .limit(FETCH_LIMIT),

      // Admin actions on this team
      supabase
        .from('admin_actions')
        .select(`
          id, action_type, performed_at, details, reason,
          admin_users:admin_user_id(id, first_name, last_name, email)
        `)
        .eq('target_team_id', teamId)
        .gte('performed_at', since)
        .order('performed_at', { ascending: false })
        .limit(FETCH_LIMIT),
    ])

    // 3. Normalize each source
    const lockboxEvents: TimelineEvent[] = (auditResult.data || []).map((e) => {
      const entry = e as unknown as Record<string, unknown>
      // Attach the human-readable lockbox_id for display
      entry.lockbox_id_display = lockboxIdMap[entry.lockbox_id as string] || null
      return normalizeLockboxAction(entry)
    })

    const emailEvents: TimelineEvent[] = (emailResult.data || []).map((e) =>
      normalizeEmail(e as unknown as Record<string, unknown>)
    )

    const adminEvents: TimelineEvent[] = (adminResult.data || []).map((e) =>
      normalizeAdminAction(e as unknown as Record<string, unknown>)
    )

    // 4. Merge and sort descending by timestamp
    const allEvents: TimelineEvent[] = [...lockboxEvents, ...emailEvents, ...adminEvents].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    // 5. Paginate
    const total = allEvents.length
    const start = page * PAGE_SIZE
    const events = allEvents.slice(start, start + PAGE_SIZE)

    return NextResponse.json({
      events,
      page,
      page_size: PAGE_SIZE,
      total,
      has_more: start + PAGE_SIZE < total,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
