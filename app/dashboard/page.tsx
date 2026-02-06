'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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
}

const TIER_LABELS: Record<string, string> = {
  free_trial: 'Free Trial',
  solo: 'Solo',
  small: 'Small Team',
  medium: 'Medium Team',
  enterprise: 'Enterprise',
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/auth/me').then((r) => {
        if (!r.ok) throw new Error('Unauthorized')
        return r.json()
      }),
      fetch('/api/dashboard/metrics').then((r) => {
        if (!r.ok) throw new Error('Failed')
        return r.json()
      }),
    ])
      .then(([authData, metricsData]) => {
        setAdmin(authData.admin)
        setMetrics(metricsData)
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

  // Color logic
  const s24hColor = metrics.signups_24h.total > 0 ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'
  const s24hDot = metrics.signups_24h.total > 0 ? 'bg-green-500' : 'bg-gray-300'

  const s7d = metrics.signups_7d.total
  const s7dColor = s7d > 5 ? 'border-green-400 bg-green-50' : s7d >= 1 ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-gray-50'
  const s7dDot = s7d > 5 ? 'bg-green-500' : s7d >= 1 ? 'bg-yellow-500' : 'bg-gray-300'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">SLIM Admin</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {[admin.first_name, admin.last_name].filter(Boolean).join(' ')} <span className="text-gray-400">({roleLabel[admin.role]})</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 flex gap-6 text-sm">
          <a href="/dashboard" className="py-2.5 border-b-2 border-gray-900 text-gray-900 font-medium">Dashboard</a>
          <a href="/customers" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Customers</a>
          <a href="/alerts" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Alerts</a>
          <a href="/errors" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Errors</a>
          <a href="/audit" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Audit Log</a>
          {admin.role === 'super_admin' && (
            <a href="/admin-users" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Admin Users</a>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">System Health</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: New Signups (24h) */}
          <div
            onClick={() => router.push('/customers?sort=signup_date&order=desc')}
            className={`rounded-lg border-2 p-5 cursor-pointer hover:shadow-sm transition-shadow ${s24hColor}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${s24hDot}`} />
              <h3 className="text-sm font-medium text-gray-600">New Signups (24h)</h3>
            </div>
            <p className="text-3xl font-semibold text-gray-900">{metrics.signups_24h.total}</p>
            <p className="text-xs text-gray-500 mt-1">{tierBreakdown(metrics.signups_24h.by_tier)}</p>
          </div>

          {/* Card 2: New Signups (7d) */}
          <div
            onClick={() => router.push('/customers?sort=signup_date&order=desc')}
            className={`rounded-lg border-2 p-5 cursor-pointer hover:shadow-sm transition-shadow ${s7dColor}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${s7dDot}`} />
              <h3 className="text-sm font-medium text-gray-600">New Signups (7d)</h3>
            </div>
            <p className="text-3xl font-semibold text-gray-900">{metrics.signups_7d.total}</p>
            <p className="text-xs text-gray-500 mt-1">{tierBreakdown(metrics.signups_7d.by_tier)}</p>
          </div>

          {/* Card 3: Total Lockbox Code Views */}
          <div className="rounded-lg border-2 border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <h3 className="text-sm font-medium text-gray-600">Lockbox Code Views</h3>
            </div>
            <p className="text-3xl font-semibold text-gray-900">{metrics.total_code_views.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">Across all customers</p>
          </div>

          {/* Card 4: Total Customers */}
          <div
            onClick={() => router.push('/customers')}
            className="rounded-lg border-2 border-gray-200 bg-white p-5 cursor-pointer hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <h3 className="text-sm font-medium text-gray-600">Total Customers</h3>
            </div>
            <p className="text-3xl font-semibold text-gray-900">{metrics.total_customers.active}</p>
            <p className="text-xs text-gray-500 mt-1">
              {metrics.total_customers.trial} on trial, {metrics.total_customers.paid} paying
              {metrics.total_customers.pending_cancellation > 0 && (
                <>, {metrics.total_customers.pending_cancellation} pending cancel</>
              )}
            </p>
          </div>

          {/* Card 5: Total Lockboxes */}
          <div className="rounded-lg border-2 border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <h3 className="text-sm font-medium text-gray-600">Total Lockboxes</h3>
            </div>
            <p className="text-3xl font-semibold text-gray-900">{metrics.total_lockboxes}</p>
            <p className="text-xs text-gray-500 mt-1">In system</p>
          </div>

          {/* Card 6: Active Installations */}
          <div className="rounded-lg border-2 border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <h3 className="text-sm font-medium text-gray-600">Active Installations</h3>
            </div>
            <p className="text-3xl font-semibold text-gray-900">{metrics.total_installed}</p>
            <p className="text-xs text-gray-500 mt-1">Status: Installed</p>
          </div>
        </div>
      </main>
    </div>
  )
}
