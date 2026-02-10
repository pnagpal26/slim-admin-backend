export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, handleApiError, logAdminAction } from '@/lib/api-helpers'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const admin = requireRole(req, 'comp_month')
    const { teamId, reason } = await req.json()

    if (!teamId || !reason) {
      return NextResponse.json(
        { error: 'teamId and reason are required' },
        { status: 400 }
      )
    }

    if (reason.trim().length < 3) {
      return NextResponse.json(
        { error: 'Reason must be at least 3 characters' },
        { status: 400 }
      )
    }

    // Fetch team with stripe data including subscription ID
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select(`
        id, name, plan_tier,
        stripe_customers(id, stripe_subscription_id, subscription_status, current_period_end)
      `)
      .eq('id', teamId)
      .single()

    if (teamError || !team) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const stripe = (team as Record<string, unknown>).stripe_customers as
      | { id: string; stripe_subscription_id: string | null; subscription_status: string; current_period_end: string | null }[]
      | null
    const stripeRecord = stripe?.[0]

    if (!stripeRecord) {
      return NextResponse.json(
        { error: 'No billing record found for this customer' },
        { status: 400 }
      )
    }

    if (stripeRecord.subscription_status !== 'active') {
      return NextResponse.json(
        { error: 'Can only comp months for active paid accounts' },
        { status: 400 }
      )
    }

    // Add 30 days to current_period_end
    const currentEnd = stripeRecord.current_period_end
      ? new Date(stripeRecord.current_period_end)
      : new Date()

    const newEnd = new Date(currentEnd.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Update local DB
    const { error: updateError } = await supabase
      .from('stripe_customers')
      .update({
        current_period_end: newEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('team_id', teamId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to comp month' }, { status: 500 })
    }

    // Sync with Stripe — extend subscription via trial_end
    if (!stripeRecord.stripe_subscription_id) {
      // Revert local DB change — no Stripe subscription to extend
      await supabase
        .from('stripe_customers')
        .update({
          current_period_end: currentEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('team_id', teamId)

      return NextResponse.json(
        { error: 'No Stripe subscription found for this customer. Cannot comp month.' },
        { status: 400 }
      )
    }

    try {
      const stripeClient = await getStripe()
      await stripeClient.subscriptions.update(stripeRecord.stripe_subscription_id, {
        trial_end: Math.floor(newEnd.getTime() / 1000),
        proration_behavior: 'none',
      })
    } catch (err) {
      const stripeError = err instanceof Error ? err.message : 'Unknown Stripe error'
      console.error('[comp-month] Stripe sync failed:', stripeError)

      // Revert local DB change since Stripe failed
      await supabase
        .from('stripe_customers')
        .update({
          current_period_end: currentEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('team_id', teamId)

      await logAdminAction(admin.adminId, 'comp_month', {
        targetTeamId: teamId,
        reason: reason.trim(),
        details: {
          team_name: team.name,
          stripe_synced: false,
          stripe_error: stripeError,
        },
      })

      return NextResponse.json(
        { error: `Stripe sync failed: ${stripeError}` },
        { status: 502 }
      )
    }

    // Log successful admin action
    await logAdminAction(admin.adminId, 'comp_month', {
      targetTeamId: teamId,
      reason: reason.trim(),
      details: {
        days_added: 30,
        previous_period_end: currentEnd.toISOString(),
        new_period_end: newEnd.toISOString(),
        team_name: team.name,
        stripe_synced: true,
      },
    })

    return NextResponse.json({
      success: true,
      new_period_end: newEnd.toISOString(),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
