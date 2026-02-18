'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TIER_LABELS } from '@/lib/constants'
import { AdminNav } from '@/app/components/AdminNav'

interface AdminUser {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
}

interface Metrics {
  signups_24h: { total: number; by_tier: Record<string, number> }
  signups_7d: { total: number; by_tier: Record<string, number> }
  total_code_views: number
  total_customers: { active: number; trial: number; paid: number; pending_cancellation: number }
  total_lockboxes: number
  total_installed: number
  financial: {
    disputes_needing_action: number
    disputes_urgent_deadline: number
    refunds_7d: {
      count: number
      total_amount: number
      by_status: Record<string, number>
    }
    suspended_accounts: number
  }
}

interface EmailBounceMetrics {
  total_24h: number
  critical_24h: number
  billing_24h: number
  teams_affected: number
}

function tierBreakdown(byTier: Record<string, number>): string {
  const parts: string[] = []
  for (const [tier, count] of Object.entries(byTier)) {
    if (count > 0) parts.push(`${count} ${TIER_LABELS[tier] || tier}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'None'
}

export default function DashboardPage() {
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [bounceMetrics, setBounceMetrics] = useState<EmailBounceMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me', { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error('Unauthorized')
        return r.json()
      }),
      fetch('/api/dashboard/metrics', { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error('Failed')
        return r.json()
      }),
      fetch('/api/dashboard/email-bounces', { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error('Failed')
        return r.json()
      }),
    ])
      .then(([authData, metricsData, bounceData]) => {
        setAdmin(authData.admin)
        setMetrics(metricsData)
        setBounceMetrics(bounceData)
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false))
  }, [router])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!admin || !metrics) return null

  const roleLabel: Record<string, string> = {
    super_admin: 'Super Admin',
    support_l1: 'Support L1',
    support_l2: 'Support L2',
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="bg-[#0D7377]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">SLIM Admin</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/80">
              {[admin.first_name, admin.last_name].filter(Boolean).join(' ')} <span className="text-white/60">({roleLabel[admin.role]})</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-white/70 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <AdminNav active="dashboard" role={admin?.role ?? null} />

      <main className="max-w-7xl mx-auto px-4 py-7">
        {/* ACTIVITY Section */}
        <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-4">Activity</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-7">
          {/* Card 1: New Signups (24h) — Gradient */}
          <div
            onClick={() => router.push('/customers?sort=signup_date&order=desc')}
            className="relative overflow-hidden rounded-2xl p-6 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #0D7377 0%, #14919B 100%)',
              boxShadow: '0 4px 15px rgba(13, 115, 119, 0.3)',
            }}
          >
            <div className="absolute -top-1/2 -right-1/2 w-full h-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)' }} />
            <div className="relative">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-sm">&#8599;</span>
                <h3 className="text-[13px] font-medium text-white/90">New Signups (24h)</h3>
              </div>
              <p className="text-4xl font-bold text-white" style={{ letterSpacing: '-1px' }}>{metrics.signups_24h.total}</p>
              <p className="text-[13px] text-white/80 mt-1">{tierBreakdown(metrics.signups_24h.by_tier)}</p>
            </div>
          </div>

          {/* Card 2: New Signups (7d) — Gradient */}
          <div
            onClick={() => router.push('/customers?sort=signup_date&order=desc')}
            className="relative overflow-hidden rounded-2xl p-6 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #0D7377 0%, #14919B 100%)',
              boxShadow: '0 4px 15px rgba(13, 115, 119, 0.3)',
            }}
          >
            <div className="absolute -top-1/2 -right-1/2 w-full h-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)' }} />
            <div className="relative">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-sm">&#128202;</span>
                <h3 className="text-[13px] font-medium text-white/90">New Signups (7d)</h3>
              </div>
              <p className="text-4xl font-bold text-white" style={{ letterSpacing: '-1px' }}>{metrics.signups_7d.total}</p>
              <p className="text-[13px] text-white/80 mt-1">{tierBreakdown(metrics.signups_7d.by_tier)}</p>
            </div>
          </div>

          {/* Card 3: Code Views Today — Gradient */}
          <div
            className="relative overflow-hidden rounded-2xl p-6 transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #0D7377 0%, #14919B 100%)',
              boxShadow: '0 4px 15px rgba(13, 115, 119, 0.3)',
            }}
          >
            <div className="absolute -top-1/2 -right-1/2 w-full h-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)' }} />
            <div className="relative">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-sm">&#128274;</span>
                <h3 className="text-[13px] font-medium text-white/90">Code Views Today</h3>
              </div>
              <p className="text-4xl font-bold text-white" style={{ letterSpacing: '-1px' }}>{metrics.total_code_views.toLocaleString()}</p>
              <p className="text-[13px] text-white/80 mt-1">Across all customers</p>
            </div>
          </div>
        </div>

        {/* OVERVIEW Section */}
        <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-4">Overview</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 4: Total Customers — Secondary */}
          <div
            onClick={() => router.push('/customers')}
            className="rounded-2xl p-6 bg-white border border-gray-200 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
            style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-7 h-7 rounded-lg bg-[#E6F4F4] flex items-center justify-center text-sm text-[#0D7377]">&#128101;</span>
              <h3 className="text-[13px] font-medium text-gray-500">Total Customers</h3>
            </div>
            <p className="text-4xl font-bold text-gray-800" style={{ letterSpacing: '-1px' }}>{metrics.total_customers.active}</p>
            <p className="text-[13px] text-gray-500 mt-1">
              {metrics.total_customers.trial} on trial, {metrics.total_customers.paid} paying
              {metrics.total_customers.pending_cancellation > 0 && (
                <>, {metrics.total_customers.pending_cancellation} pending cancel</>
              )}
            </p>
          </div>

          {/* Card 5: Total Lockboxes — Secondary */}
          <div
            className="rounded-2xl p-6 bg-white border border-gray-200 transition-transform duration-200 hover:-translate-y-0.5"
            style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-7 h-7 rounded-lg bg-[#E6F4F4] flex items-center justify-center text-sm text-[#0D7377]">&#128230;</span>
              <h3 className="text-[13px] font-medium text-gray-500">Total Lockboxes</h3>
            </div>
            <p className="text-4xl font-bold text-gray-800" style={{ letterSpacing: '-1px' }}>{metrics.total_lockboxes}</p>
            <p className="text-[13px] text-gray-500 mt-1">In system</p>
          </div>

          {/* Card 6: Active Installations — Secondary */}
          <div
            className="rounded-2xl p-6 bg-white border border-gray-200 transition-transform duration-200 hover:-translate-y-0.5"
            style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-7 h-7 rounded-lg bg-[#E6F4F4] flex items-center justify-center text-sm text-[#0D7377]">&#127968;</span>
              <h3 className="text-[13px] font-medium text-gray-500">Active Installations</h3>
            </div>
            <p className="text-4xl font-bold text-gray-800" style={{ letterSpacing: '-1px' }}>{metrics.total_installed}</p>
            <p className="text-[13px] text-gray-500 mt-1">Status: Installed</p>
          </div>
        </div>

        {/* FINANCIAL HEALTH Section */}
        <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-4 mt-7">Financial Health</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Disputes Needing Action */}
          <div
            className="relative overflow-hidden rounded-2xl p-6 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
              boxShadow: '0 4px 15px rgba(220, 38, 38, 0.3)',
            }}
          >
            <div className="absolute -top-1/2 -right-1/2 w-full h-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)' }} />
            <div className="relative">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-sm">&#9888;</span>
                <h3 className="text-[13px] font-medium text-white/90">Disputes Needing Action</h3>
              </div>
              <p className="text-4xl font-bold text-white" style={{ letterSpacing: '-1px' }}>
                {metrics.financial.disputes_needing_action.toLocaleString()}
              </p>
              <p className="text-[13px] text-white/80 mt-1">
                {metrics.financial.disputes_urgent_deadline > 0 ? (
                  <>
                    <span className="bg-white/30 px-2 py-0.5 rounded text-xs font-medium">
                      {metrics.financial.disputes_urgent_deadline} urgent
                    </span>
                  </>
                ) : (
                  'No urgent deadlines'
                )}
              </p>
            </div>
          </div>

          {/* Card 2: Refunds (7d) */}
          <div
            className="rounded-2xl p-6 bg-white border border-gray-200 transition-transform duration-200 hover:-translate-y-0.5"
            style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center text-sm text-orange-600">&#128176;</span>
              <h3 className="text-[13px] font-medium text-gray-500">Refunds (Last 7 Days)</h3>
            </div>
            <p className="text-4xl font-bold text-gray-800" style={{ letterSpacing: '-1px' }}>
              {metrics.financial.refunds_7d.count.toLocaleString()}
            </p>
            <p className="text-[13px] text-gray-500 mt-1">
              {metrics.financial.refunds_7d.total_amount > 0 ? (
                `$${(metrics.financial.refunds_7d.total_amount / 100).toFixed(2)} total`
              ) : (
                'No refunds'
              )}
            </p>
          </div>

          {/* Card 3: Suspended Accounts */}
          <div
            className="rounded-2xl p-6 bg-white border border-gray-200 transition-transform duration-200 hover:-translate-y-0.5"
            style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-sm text-red-600">&#128683;</span>
              <h3 className="text-[13px] font-medium text-gray-500">Suspended Accounts</h3>
            </div>
            <p className="text-4xl font-bold text-gray-800" style={{ letterSpacing: '-1px' }}>
              {metrics.financial.suspended_accounts.toLocaleString()}
            </p>
            <p className="text-[13px] text-gray-500 mt-1">Non-active status</p>
          </div>

          {/* Card 4: Email Delivery Issues */}
          {bounceMetrics && (
            <div
              onClick={() => router.push('/customers?sort=bounce_count&order=desc')}
              className={`rounded-2xl p-6 bg-white border transition-transform duration-200 hover:-translate-y-0.5 cursor-pointer ${
                bounceMetrics.critical_24h > 5
                  ? 'border-orange-300 bg-orange-50'
                  : 'border-gray-200'
              }`}
              style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${
                  bounceMetrics.critical_24h > 5
                    ? 'bg-orange-100 text-orange-600'
                    : 'bg-gray-100 text-gray-600'
                }`}>&#9993;</span>
                <h3 className="text-[13px] font-medium text-gray-500">Email Delivery Issues</h3>
              </div>
              <p className={`text-4xl font-bold ${
                bounceMetrics.critical_24h > 5 ? 'text-orange-700' : 'text-gray-800'
              }`} style={{ letterSpacing: '-1px' }}>
                {bounceMetrics.total_24h.toLocaleString()}
              </p>
              <p className="text-[13px] text-gray-500 mt-1">
                {bounceMetrics.critical_24h > 0 && (
                  <span className={`${bounceMetrics.critical_24h > 5 ? 'text-orange-700 font-medium' : 'text-gray-600'}`}>
                    {bounceMetrics.critical_24h} critical
                  </span>
                )}
                {bounceMetrics.critical_24h > 0 && bounceMetrics.billing_24h > 0 && ', '}
                {bounceMetrics.billing_24h > 0 && (
                  <span className="text-gray-600">{bounceMetrics.billing_24h} billing</span>
                )}
                {bounceMetrics.total_24h === 0 && 'No bounces in 24h'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
