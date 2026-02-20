export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'deactivate_promo_code')
    const { id } = await req.json()

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { data: existing } = await supabase
      .from('promo_codes')
      .select('id, code, is_active')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Promo code not found' }, { status: 404 })
    if (!existing.is_active) return NextResponse.json({ error: 'Promo code is already inactive' }, { status: 400 })

    const { error: updateError } = await supabase
      .from('promo_codes')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to deactivate promo code' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'deactivate_promo_code', {
      details: { promo_code_id: id, code: existing.code },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
