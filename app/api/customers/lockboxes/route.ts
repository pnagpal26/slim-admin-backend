export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_customer_detail')
    const teamId = req.nextUrl.searchParams.get('team_id')

    if (!teamId) {
      return NextResponse.json({ error: 'Team ID is required' }, { status: 400 })
    }

    // Fetch all lockboxes for the team — never select code_encrypted
    const { data: lockboxes, error } = await supabase
      .from('lockboxes')
      .select(`
        id, lockbox_id, status, current_address, make_model, description,
        closing_date, installed_at, removed_at, checked_out_at, updated_at, created_at,
        assigned_to,
        users:assigned_to(id, first_name, last_name, email)
      `)
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .order('status', { ascending: true })
      .order('updated_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch lockboxes' }, { status: 500 })
    }

    const STATUS_ORDER: Record<string, number> = {
      installed: 0,
      checked_out: 1,
      in_transit: 2,
      available: 3,
      removed: 4,
      out_of_service: 5,
    }

    const sorted = (lockboxes || []).sort((a, b) => {
      const aOrder = STATUS_ORDER[a.status] ?? 99
      const bOrder = STATUS_ORDER[b.status] ?? 99
      return aOrder - bOrder
    })

    // Summary counts by status
    const counts: Record<string, number> = {}
    sorted.forEach((lb) => {
      counts[lb.status] = (counts[lb.status] || 0) + 1
    })

    return NextResponse.json({
      lockboxes: sorted.map((lb) => ({
        id: lb.id,
        lockbox_id: lb.lockbox_id,
        status: lb.status,
        current_address: lb.current_address || null,
        make_model: lb.make_model || null,
        description: lb.description || null,
        closing_date: lb.closing_date || null,
        installed_at: lb.installed_at || null,
        removed_at: lb.removed_at || null,
        checked_out_at: lb.checked_out_at || null,
        updated_at: lb.updated_at,
        created_at: lb.created_at,
        assigned_to: lb.users
          ? {
              id: (lb.users as Record<string, unknown>).id as string,
              first_name: (lb.users as Record<string, unknown>).first_name as string,
              last_name: (lb.users as Record<string, unknown>).last_name as string,
              email: (lb.users as Record<string, unknown>).email as string,
            }
          : null,
      })),
      summary: {
        total: sorted.length,
        by_status: counts,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
