export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'create_promo_code')
    const body = await req.json()

    const {
      code, description, type, free_days, discount_percent, duration_months,
      max_redemptions, expires_at, valid_plans, new_customers_only, one_per_customer,
    } = body

    if (!code || !type) {
      return NextResponse.json({ error: 'code and type are required' }, { status: 400 })
    }

    const upperCode = code.toUpperCase().trim()
    if (!/^[A-Z0-9_-]+$/.test(upperCode)) {
      return NextResponse.json({ error: 'Code must be uppercase letters, numbers, hyphens, and underscores only' }, { status: 400 })
    }

    if (type === 'extended_trial' && (!free_days || free_days < 1)) {
      return NextResponse.json({ error: 'free_days is required for extended_trial codes' }, { status: 400 })
    }

    if (type === 'subscription_discount') {
      if (!discount_percent || discount_percent < 1 || discount_percent > 100) {
        return NextResponse.json({ error: 'discount_percent (1-100) is required for subscription_discount codes' }, { status: 400 })
      }
      if (!duration_months || duration_months < 1) {
        return NextResponse.json({ error: 'duration_months is required for subscription_discount codes' }, { status: 400 })
      }
    }

    // Check code uniqueness
    const { data: existing } = await supabase
      .from('promo_codes')
      .select('id')
      .eq('code', upperCode)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'A promo code with this code already exists' }, { status: 400 })
    }

    let stripe_coupon_id: string | null = null
    let stripe_promotion_code_id: string | null = null

    // For subscription_discount, create Stripe coupon first
    if (type === 'subscription_discount') {
      try {
        const stripe = await getStripe()

        // Create coupon
        const coupon = await stripe.coupons.create({
          percent_off: discount_percent,
          duration: 'repeating',
          duration_in_months: duration_months,
          name: description || upperCode,
          metadata: { slim_promo_code: upperCode },
        })
        stripe_coupon_id = coupon.id

        // Create promotion code (Stripe v20: coupon nested under `promotion`)
        const promotionCode = await stripe.promotionCodes.create({
          promotion: { type: 'coupon', coupon: coupon.id },
          code: upperCode,
          metadata: { slim_promo_code: upperCode },
          ...(max_redemptions ? { max_redemptions } : {}),
          ...(expires_at ? { expires_at: Math.floor(new Date(expires_at).getTime() / 1000) } : {}),
        })
        stripe_promotion_code_id = promotionCode.id
      } catch (stripeError) {
        const msg = stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error'
        console.error('[promo-codes/create] Stripe error:', msg)
        return NextResponse.json({ error: `Stripe error: ${msg}` }, { status: 502 })
      }
    }

    // Insert DB record
    const { data: newCode, error: insertError } = await supabase
      .from('promo_codes')
      .insert({
        code: upperCode,
        description: description || null,
        type,
        free_days: type === 'extended_trial' ? free_days : null,
        discount_percent: type === 'subscription_discount' ? discount_percent : null,
        duration_months: type === 'subscription_discount' ? duration_months : null,
        stripe_coupon_id,
        stripe_promotion_code_id,
        max_redemptions: max_redemptions || null,
        expires_at: expires_at || null,
        valid_plans: valid_plans?.length ? valid_plans : null,
        new_customers_only: new_customers_only || false,
        one_per_customer: one_per_customer || false,
        created_by_admin_id: admin.adminId,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[promo-codes/create] DB error:', insertError)
      return NextResponse.json({ error: 'Failed to create promo code' }, { status: 500 })
    }

    await logAdminAction(admin.adminId, 'create_promo_code', {
      details: { code: upperCode, type, stripe_coupon_id, stripe_promotion_code_id },
    })

    return NextResponse.json({ success: true, promo_code: newCode })
  } catch (error) {
    return handleApiError(error)
  }
}
