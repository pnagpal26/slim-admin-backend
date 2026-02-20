export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  try {
    requireRole(req, 'view_promo_codes')

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { data: promoCode, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !promoCode) {
      return NextResponse.json({ error: 'Promo code not found' }, { status: 404 })
    }

    const { data: redemptions } = await supabase
      .from('promo_code_redemptions')
      .select(`
        id, status, applied_to, plan, redeemed_at, subscription_applied_at, applied_by_admin_id,
        teams(id, name),
        users(id, first_name, last_name, email)
      `)
      .eq('promo_code_id', id)
      .order('redeemed_at', { ascending: false })
      .limit(100)

    return NextResponse.json({ promo_code: promoCode, redemptions: redemptions || [] })
  } catch (error) {
    return handleApiError(error)
  }
}
