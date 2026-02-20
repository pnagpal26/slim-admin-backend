export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_promo_codes')

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || ''
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = 50
    const offset = (page - 1) * limit

    let query = supabase
      .from('promo_codes')
      .select('id, code, description, type, free_days, discount_percent, duration_months, max_redemptions, current_redemptions, expires_at, valid_plans, new_customers_only, one_per_customer, is_active, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (type) query = query.eq('type', type)
    if (status === 'active') query = query.eq('is_active', true)
    if (status === 'inactive') query = query.eq('is_active', false)
    if (search) query = query.ilike('code', `%${search}%`)

    const { data, error } = await query

    if (error) {
      console.error('[promo-codes/list] DB error:', error)
      return NextResponse.json({ error: 'Failed to fetch promo codes' }, { status: 500 })
    }

    return NextResponse.json({ promo_codes: data || [], total: data?.length || 0, page, limit })
  } catch (error) {
    return handleApiError(error)
  }
}
