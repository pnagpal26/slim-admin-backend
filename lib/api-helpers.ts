import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken, ADMIN_COOKIE_NAME, AdminTokenPayload } from './auth'
import { hasPermission, Permission, PermissionError } from './permissions'
import { supabase } from './supabase'

export function getAdminFromRequest(req: NextRequest): AdminTokenPayload | null {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  if (!token) return null
  return verifyAdminToken(token)
}

export function requireAdmin(req: NextRequest): AdminTokenPayload {
  const admin = getAdminFromRequest(req)
  if (!admin) throw new AuthError('Unauthorized')
  return admin
}

export function requireRole(req: NextRequest, permission: Permission): AdminTokenPayload {
  const admin = requireAdmin(req)
  if (!hasPermission(admin, permission)) {
    throw new PermissionError(`Insufficient permissions for '${permission}'`)
  }
  return admin
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
  if (error instanceof PermissionError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  console.error('API error:', error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// Compute customer status from plan_tier + stripe subscription data
export function computeCustomerStatus(
  planTier: string,
  stripe: { subscription_status: string; cancel_at_period_end: boolean } | null
): string {
  if (planTier === 'free_trial') return 'active_trial'

  if (!stripe || stripe.subscription_status === 'inactive') return 'cancelled'

  if (stripe.subscription_status === 'past_due') return 'past_due'

  if (stripe.subscription_status === 'canceled') return 'cancelled'

  if (stripe.subscription_status === 'active' && stripe.cancel_at_period_end) {
    return 'pending_cancellation'
  }

  if (stripe.subscription_status === 'active') return 'active_paid'

  return 'cancelled'
}

export async function logAdminAction(
  adminUserId: string,
  actionType: string,
  options: {
    targetTeamId?: string
    targetUserId?: string
    details?: Record<string, unknown>
    reason?: string
  } = {}
) {
  await supabase.from('admin_actions').insert({
    admin_user_id: adminUserId,
    action_type: actionType,
    target_team_id: options.targetTeamId || null,
    target_user_id: options.targetUserId || null,
    details: options.details || null,
    reason: options.reason || null,
  })
}
