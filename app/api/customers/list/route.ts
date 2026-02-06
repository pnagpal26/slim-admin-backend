export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, computeCustomerStatus } from '@/lib/api-helpers'
import { formatPersonName } from '@/lib/utils/format'

const PAGE_SIZE = 50

interface TeamRow {
  id: string
  name: string
  plan_tier: string
  billing_exempt: boolean
  created_at: string
  trial_ends_at: string | null
  users: {
    id: string
    email: string
    first_name: string
    last_name: string
    role: string
    last_active_at: string | null
    is_active: boolean
  }[]
  stripe_customers: {
    subscription_status: string
    cancel_at_period_end: boolean
    current_period_end: string | null
  }[]
}

export async function GET(req: NextRequest) {
  try {
    const admin = requireRole(req, 'view_customers')

    const url = req.nextUrl
    const search = url.searchParams.get('search')?.trim().toLowerCase() || ''
    const filterTier = url.searchParams.get('plan_tier') || ''
    const filterStatus = url.searchParams.get('status') || ''
    const sortBy = url.searchParams.get('sort') || 'signup_date'
    const sortOrder = url.searchParams.get('order') || 'desc'
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))

    // Fetch all teams with users and stripe data
    const { data: teams, error } = await supabase
      .from('teams')
      .select(`
        id, name, plan_tier, billing_exempt, created_at, trial_ends_at,
        users(id, email, first_name, last_name, role, last_active_at, is_active),
        stripe_customers(subscription_status, cancel_at_period_end, current_period_end)
      `) as { data: TeamRow[] | null; error: unknown }

    if (error || !teams) {
      return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
    }

    // Transform each team into a customer row
    let customers = teams.map((team) => {
      const leader = team.users.find(
        (u) => u.role === 'team_leader' || u.role === 'solo_agent'
      )
      const lastLogin = team.users.reduce<string | null>((latest, u) => {
        if (!u.last_active_at) return latest
        if (!latest) return u.last_active_at
        return u.last_active_at > latest ? u.last_active_at : latest
      }, null)

      const stripe = team.stripe_customers?.[0] || null
      const status = computeCustomerStatus(team.plan_tier, stripe)

      return {
        id: team.id,
        team_name: team.name,
        contact_email: leader?.email || 'N/A',
        contact_name: [formatPersonName(leader?.first_name), formatPersonName(leader?.last_name)].filter(Boolean).join(' ') || 'N/A',
        plan_tier: team.plan_tier,
        billing_exempt: team.billing_exempt,
        signup_date: team.created_at,
        last_login: lastLogin,
        status,
        member_count: team.users.filter((u) => u.is_active).length,
      }
    })

    // Apply search filter (team name or contact email)
    if (search) {
      customers = customers.filter(
        (c) =>
          c.team_name.toLowerCase().includes(search) ||
          c.contact_email.toLowerCase().includes(search)
      )
    }

    // Apply plan tier filter
    if (filterTier) {
      customers = customers.filter((c) => c.plan_tier === filterTier)
    }

    // Apply status filter
    if (filterStatus) {
      customers = customers.filter((c) => c.status === filterStatus)
    }

    // Sort
    customers.sort((a, b) => {
      let aVal: string | null
      let bVal: string | null

      if (sortBy === 'last_login') {
        aVal = a.last_login
        bVal = b.last_login
      } else {
        aVal = a.signup_date
        bVal = b.signup_date
      }

      // Nulls go to the end
      if (!aVal && !bVal) return 0
      if (!aVal) return 1
      if (!bVal) return -1

      const cmp = aVal.localeCompare(bVal)
      return sortOrder === 'asc' ? cmp : -cmp
    })

    // Paginate
    const total = customers.length
    const start = (page - 1) * PAGE_SIZE
    const paginated = customers.slice(start, start + PAGE_SIZE)

    return NextResponse.json({
      customers: paginated,
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
