export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

const PAGE_SIZE = 100

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_audit_history')

    const url = req.nextUrl
    const teamId = url.searchParams.get('team_id') || ''
    const userId = url.searchParams.get('user_id') || ''
    const actionType = url.searchParams.get('action_type') || ''
    const dateFrom = url.searchParams.get('date_from') || ''
    const dateTo = url.searchParams.get('date_to') || ''
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))

    // Fetch lockbox IDs for team filter
    let lockboxIds: string[] | null = null
    if (teamId) {
      const { data: lockboxes } = await supabase
        .from('lockboxes')
        .select('id')
        .eq('team_id', teamId)
      lockboxIds = lockboxes?.map((l) => l.id) || []
    }

    let query = supabase
      .from('audit_log')
      .select(`
        id, lockbox_id, action, performed_at, action_method,
        before_state, after_state, details,
        users:performed_by(id, name, email),
        lockboxes:lockbox_id(id, lockbox_id, team_id, teams:team_id(id, name))
      `, { count: 'exact' })

    if (lockboxIds !== null) {
      if (lockboxIds.length === 0) {
        // No lockboxes for this team, return empty
        return NextResponse.json({
          entries: [],
          total: 0,
          page,
          pageSize: PAGE_SIZE,
          totalPages: 0,
        })
      }
      query = query.in('lockbox_id', lockboxIds)
    }

    if (userId) {
      query = query.eq('performed_by', userId)
    }
    if (actionType) {
      query = query.eq('action', actionType)
    }
    if (dateFrom) {
      query = query.gte('performed_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('performed_at', new Date(dateTo + 'T23:59:59.999Z').toISOString())
    }

    const start = (page - 1) * PAGE_SIZE
    query = query
      .order('performed_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1)

    const { data: entries, error, count } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch audit entries' }, { status: 500 })
    }

    // Also include admin_actions in audit view
    let adminActions: Record<string, unknown>[] = []
    let adminCount = 0
    if (!userId) {
      // Only include admin actions if not filtering by customer user
      let adminQuery = supabase
        .from('admin_actions')
        .select(`
          id, action_type, performed_at, details, reason,
          admin_users:admin_user_id(id, name, email),
          teams:target_team_id(id, name)
        `, { count: 'exact' })

      if (teamId) {
        adminQuery = adminQuery.eq('target_team_id', teamId)
      }
      if (actionType) {
        adminQuery = adminQuery.eq('action_type', actionType)
      }
      if (dateFrom) {
        adminQuery = adminQuery.gte('performed_at', dateFrom)
      }
      if (dateTo) {
        adminQuery = adminQuery.lte('performed_at', new Date(dateTo + 'T23:59:59.999Z').toISOString())
      }

      adminQuery = adminQuery.order('performed_at', { ascending: false }).limit(PAGE_SIZE)

      const { data: aActions, count: aCount } = await adminQuery
      adminActions = (aActions || []) as Record<string, unknown>[]
      adminCount = aCount || 0
    }

    // Normalize and merge both sources
    const normalizedCustomer = ((entries || []) as Record<string, unknown>[]).map((e) => ({
      id: e.id,
      source: 'customer',
      timestamp: e.performed_at,
      action: e.action,
      user: e.users || null,
      team: (e.lockboxes as Record<string, unknown>)?.teams || null,
      lockbox_id: (e.lockboxes as Record<string, unknown>)?.lockbox_id || null,
      details: e.details || e.after_state || null,
      action_method: e.action_method,
    }))

    const normalizedAdmin = adminActions.map((a) => ({
      id: a.id,
      source: 'admin',
      timestamp: a.performed_at,
      action: a.action_type,
      user: a.admin_users || null,
      team: a.teams || null,
      lockbox_id: null,
      details: a.details || null,
      action_method: 'admin',
      reason: a.reason,
    }))

    // Merge and sort by timestamp descending
    const merged = [...normalizedCustomer, ...normalizedAdmin]
      .sort((a, b) => {
        const ta = a.timestamp as string
        const tb = b.timestamp as string
        return tb.localeCompare(ta)
      })
      .slice(0, PAGE_SIZE)

    return NextResponse.json({
      entries: merged,
      total: (count || 0) + adminCount,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(((count || 0) + adminCount) / PAGE_SIZE),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
