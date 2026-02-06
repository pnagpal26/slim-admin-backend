export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_error_log')

    const url = req.nextUrl
    const status = url.searchParams.get('status') || 'active'
    const errorType = url.searchParams.get('error_type') || ''
    const endpoint = url.searchParams.get('endpoint') || ''
    const teamId = url.searchParams.get('team_id') || ''
    const dateFrom = url.searchParams.get('date_from') || ''
    const dateTo = url.searchParams.get('date_to') || ''
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))

    let query = supabase
      .from('error_log')
      .select(`
        id, error_type, error_message, stack_trace, endpoint,
        request_method, request_body, user_agent, ip_address,
        status, resolved_by, resolved_at, created_at,
        team_id, user_id,
        teams:team_id(id, name),
        users:user_id(id, first_name, last_name, email)
      `, { count: 'exact' })

    if (status) {
      query = query.eq('status', status)
    }
    if (errorType) {
      query = query.ilike('error_type', `%${errorType}%`)
    }
    if (endpoint) {
      query = query.ilike('endpoint', `%${endpoint}%`)
    }
    if (teamId) {
      query = query.eq('team_id', teamId)
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('created_at', new Date(dateTo + 'T23:59:59.999Z').toISOString())
    }

    const start = (page - 1) * PAGE_SIZE
    query = query
      .order('created_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1)

    const { data: errors, error, count } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch errors' }, { status: 500 })
    }

    return NextResponse.json({
      errors: errors || [],
      total: count || 0,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil((count || 0) / PAGE_SIZE),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
