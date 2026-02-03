import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  try {
    const admin = requireRole(req, 'export_audit_log')

    const url = req.nextUrl
    const teamId = url.searchParams.get('team_id') || ''
    const userId = url.searchParams.get('user_id') || ''
    const actionType = url.searchParams.get('action_type') || ''
    const dateFrom = url.searchParams.get('date_from') || ''
    const dateTo = url.searchParams.get('date_to') || ''

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
        id, lockbox_id, action, performed_at, action_method, details,
        users:performed_by(id, name, email),
        lockboxes:lockbox_id(lockbox_id, team_id, teams:team_id(name))
      `)

    if (lockboxIds !== null) {
      if (lockboxIds.length === 0) {
        // Return empty CSV
        const csv = 'Timestamp,Team,User,Action,Details\n'
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="audit-export-${new Date().toISOString().split('T')[0]}.csv"`,
          },
        })
      }
      query = query.in('lockbox_id', lockboxIds)
    }
    if (userId) query = query.eq('performed_by', userId)
    if (actionType) query = query.eq('action', actionType)
    if (dateFrom) query = query.gte('performed_at', dateFrom)
    if (dateTo) query = query.lte('performed_at', new Date(dateTo + 'T23:59:59.999Z').toISOString())

    query = query.order('performed_at', { ascending: false }).limit(10000)

    const { data: entries, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to export audit log' }, { status: 500 })
    }

    // Build CSV
    const rows = ((entries || []) as Record<string, unknown>[]).map((e) => {
      const user = e.users as { name: string; email: string } | null
      const lockbox = e.lockboxes as { lockbox_id: string; teams: { name: string } | null } | null
      const teamName = lockbox?.teams?.name || ''
      return [
        e.performed_at,
        csvEscape(teamName),
        csvEscape(user?.name || ''),
        csvEscape(user?.email || ''),
        csvEscape(e.action as string),
        csvEscape(lockbox?.lockbox_id || ''),
        csvEscape(e.action_method as string || ''),
        csvEscape(e.details ? JSON.stringify(e.details) : ''),
      ].join(',')
    })

    const header = 'Timestamp,Team,User Name,User Email,Action,Lockbox ID,Method,Details'
    const csv = [header, ...rows].join('\n')

    await logAdminAction(admin.adminId, 'export_audit_log', {
      details: {
        filters: { teamId, userId, actionType, dateFrom, dateTo },
        row_count: rows.length,
      },
    })

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

function csvEscape(val: string): string {
  if (!val) return ''
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}
