export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'apply_credit')
    const { teamId, amountCents, reason } = await req.json()

    if (!teamId || !amountCents || !reason) {
      return NextResponse.json({ error: 'teamId, amountCents, and reason are required' }, { status: 400 })
    }

    const amount = parseInt(amountCents, 10)
    if (isNaN(amount) || amount < 1 || amount > 100000) {
      return NextResponse.json({ error: 'amountCents must be between 1 and 100000' }, { status: 400 })
    }

    if (reason.trim().length < 3) {
      return NextResponse.json({ error: 'Reason must be at least 3 characters' }, { status: 400 })
    }

    // Get team's stripe customer record
    const { data: stripeCustomer } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id, subscription_status')
      .eq('team_id', teamId)
      .single()

    if (!stripeCustomer?.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe billing record found for this team. Customer must have an active subscription.' }, { status: 400 })
    }

    // Get team name for logging
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single()

    // Apply credit via Stripe Customer Balance
    // Negative amount = credit to the customer
    const stripe = await getStripe()
    try {
      await stripe.customers.createBalanceTransaction(stripeCustomer.stripe_customer_id, {
        amount: -amount,   // negative = credit
        currency: 'cad',
        description: reason.trim(),
        metadata: {
          applied_by_admin_id: admin.adminId,
          team_id: teamId,
        },
      })
    } catch (stripeError) {
      const msg = stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error'
      console.error('[apply-credit] Stripe error:', msg)
      return NextResponse.json({ error: `Stripe error: ${msg}` }, { status: 502 })
    }

    await logAdminAction(admin.adminId, 'apply_credit', {
      targetTeamId: teamId,
      reason: reason.trim(),
      details: {
        amount_cents: amount,
        currency: 'cad',
        stripe_customer_id: stripeCustomer.stripe_customer_id,
        team_name: team?.name || teamId,
      },
    })

    return NextResponse.json({
      success: true,
      amount_cents: amount,
      currency: 'cad',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
