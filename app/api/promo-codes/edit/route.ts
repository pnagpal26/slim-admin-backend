export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'edit_promo_code')
    const { id, max_redemptions, expires_at } = await req.json()

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { data: existing } = await supabase
      .from('promo_codes')
      .select('id, expires_at')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Promo code not found' }, { status: 404 })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (max_redemptions !== undefined) updates.max_redemptions = max_redemptions || null
    if (expires_at !== undefined) {
      updates.expires_at = expires_at || null
      // If expiry changed, reset expiry notification on all affected teams
      if (expires_at !== existing.expires_at) {
        await supabase
          .from('teams')
          .update({ pending_code_expiry_notified_at: null, updated_at: new Date().toISOString() })
          .eq('pending_promo_code_id', id)
      }
    }

    const { error: updateError } = await supabase
      .from('promo_codes')
      .update(updates)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update promo code' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'edit_promo_code', {
      details: { promo_code_id: id, changes: updates },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
