export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'apply_promo_code')
    const { teamId, code, force } = await req.json()

    if (!teamId || !code) {
      return NextResponse.json({ error: 'teamId and code are required' }, { status: 400 })
    }

    const upperCode = code.toUpperCase().trim()

    // Fetch promo code
    const { data: promoCode, error: pcError } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', upperCode)
      .single()

    if (pcError || !promoCode) {
      return NextResponse.json({ error: 'Promo code not found' }, { status: 404 })
    }

    if (!promoCode.is_active) {
      return NextResponse.json({ error: 'Promo code is not active' }, { status: 400 })
    }

    if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Promo code has expired' }, { status: 400 })
    }

    if (promoCode.max_redemptions !== null && promoCode.current_redemptions >= promoCode.max_redemptions) {
      return NextResponse.json({ error: 'Promo code has reached its redemption limit' }, { status: 400 })
    }

    // Fetch team
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, plan_tier, trial_ends_at, created_at, has_ever_subscribed, pending_promo_code_id')
      .eq('id', teamId)
      .single()

    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    // new_customers_only check (admin can override with force: true)
    if (promoCode.new_customers_only && team.has_ever_subscribed && !force) {
      return NextResponse.json({
        error: 'This code is for new customers only. Pass force: true to override.',
        requiresForce: true,
      }, { status: 400 })
    }

    // one_per_customer check (admin can override with force: true)
    if (promoCode.one_per_customer && !force) {
      const { data: existing } = await supabase
        .from('promo_code_redemptions')
        .select('id')
        .eq('promo_code_id', promoCode.id)
        .eq('team_id', teamId)
        .neq('status', 'reversed')
        .limit(1)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({
          error: 'This team has already used this code. Pass force: true to override.',
          requiresForce: true,
        }, { status: 400 })
      }
    }

    if (promoCode.type === 'extended_trial') {
      if (team.plan_tier !== 'free_trial') {
        return NextResponse.json({ error: 'Trial extension codes only apply to teams on free trial' }, { status: 400 })
      }

      const currentEnd = team.trial_ends_at
        ? new Date(team.trial_ends_at)
        : new Date(new Date(team.created_at).getTime() + 14 * 24 * 60 * 60 * 1000)

      const newEnd = new Date(currentEnd.getTime() + promoCode.free_days * 24 * 60 * 60 * 1000)

      await supabase
        .from('teams')
        .update({ trial_ends_at: newEnd.toISOString(), updated_at: new Date().toISOString() })
        .eq('id', teamId)

      await supabase.from('promo_code_redemptions').insert({
        promo_code_id: promoCode.id,
        team_id: teamId,
        applied_by_admin_id: admin.adminId,
        status: 'active',
        applied_to: 'trial_extension',
      })

      await supabase
        .from('promo_codes')
        .update({ current_redemptions: promoCode.current_redemptions + 1, updated_at: new Date().toISOString() })
        .eq('id', promoCode.id)

      await logAdminAction(admin.adminId, 'apply_promo_code', {
        targetTeamId: teamId,
        details: {
          code: upperCode,
          type: 'extended_trial',
          free_days: promoCode.free_days,
          new_trial_end: newEnd.toISOString(),
          team_name: team.name,
          forced: !!force,
        },
      })

      return NextResponse.json({ success: true, type: 'extended_trial', trial_ends_at: newEnd.toISOString() })
    }

    // subscription_discount
    // Replace any existing pending code
    if (team.pending_promo_code_id && team.pending_promo_code_id !== promoCode.id) {
      await supabase
        .from('promo_code_redemptions')
        .update({ status: 'reversed', updated_at: new Date().toISOString() })
        .eq('team_id', teamId)
        .eq('promo_code_id', team.pending_promo_code_id)
        .eq('status', 'active')

      const { data: oldCode } = await supabase
        .from('promo_codes')
        .select('current_redemptions')
        .eq('id', team.pending_promo_code_id)
        .single()
      if (oldCode && oldCode.current_redemptions > 0) {
        await supabase
          .from('promo_codes')
          .update({ current_redemptions: oldCode.current_redemptions - 1, updated_at: new Date().toISOString() })
          .eq('id', team.pending_promo_code_id)
      }
    }

    await supabase
      .from('teams')
      .update({ pending_promo_code_id: promoCode.id, updated_at: new Date().toISOString() })
      .eq('id', teamId)

    await supabase.from('promo_code_redemptions').insert({
      promo_code_id: promoCode.id,
      team_id: teamId,
      applied_by_admin_id: admin.adminId,
      status: 'active',
    })

    await supabase
      .from('promo_codes')
      .update({ current_redemptions: promoCode.current_redemptions + 1, updated_at: new Date().toISOString() })
      .eq('id', promoCode.id)

    await logAdminAction(admin.adminId, 'apply_promo_code', {
      targetTeamId: teamId,
      details: {
        code: upperCode,
        type: 'subscription_discount',
        discount_percent: promoCode.discount_percent,
        duration_months: promoCode.duration_months,
        team_name: team.name,
        forced: !!force,
      },
    })

    return NextResponse.json({ success: true, type: 'subscription_discount' })
  } catch (error) {
    return handleApiError(error)
  }
}
