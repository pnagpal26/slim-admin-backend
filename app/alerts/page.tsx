'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AlertData {
  last_viewed: string | null
  errors: { count_24h: number; count_7d: number }
  failed_payments: { team_id: string; team_name: string; email: string; plan_tier: string; days_overdue: number }[]
  trial_expiring: { team_id: string; team_name: string; email: string; days_remaining: number; lockboxes_added: number }[]
  pending_cancellations: { team_id: string; team_name: string; email: string; plan_tier: string; cancellation_date: string | null }[]
  inactive_accounts: { team_id: string; team_name: string; email: string; signup_date: string; days_since_login: number; is_trial: boolean }[]
  high_usage: { team_id: string; team_name: string; installed: number; plan_limit: number; plan_tier: string; usage_text: string }[]
}

const TIER_LABELS: Record<string, string> = {
  free_trial: 'Free Trial', solo: 'Solo', small: 'Small Team', medium: 'Medium Team', enterprise: 'Enterprise',
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Section({
  title,
  count,
  color,
  defaultOpen,
  children,
}: {
  title: string
  count: number
  color: 'red' | 'yellow' | 'green' | 'gray'
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? count > 0)

  const colorMap = {
    red: 'border-red-300 bg-red-50',
    yellow: 'border-yellow-300 bg-yellow-50',
    green: 'border-green-300 bg-green-50',
    gray: 'border-gray-200 bg-gray-50',
  }
  const dotMap = {
    red: 'bg-red-500',
    yellow: 'bg-yellow-500',
    green: 'bg-green-500',
    gray: 'bg-gray-300',
  }
  const badgeMap = {
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    green: 'bg-green-100 text-green-700',
    gray: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className={`rounded-lg border ${count > 0 ? colorMap[color] : 'border-gray-200 bg-white'}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full ${count > 0 ? dotMap[color] : 'bg-gray-300'}`} />
          <span className="font-medium text-gray-900 text-sm">{title}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${count > 0 ? badgeMap[color] : badgeMap.gray}`}>
            {count}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

export default function AlertsPage() {
  const router = useRouter()
  const [data, setData] = useState<AlertData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/alerts/list')
      .then((r) => {
        if (!r.ok) {
          if (r.status === 401) { router.push('/login'); return null }
          throw new Error('Failed')
        }
        return r.json()
      })
      .then((d) => { if (d) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!data) return null

  const errorColor = (data.errors.count_24h > 10) ? 'red' : data.errors.count_24h >= 1 ? 'yellow' : 'green'
  const totalAlerts =
    data.errors.count_24h +
    data.failed_payments.length +
    data.trial_expiring.length +
    data.pending_cancellations.length +
    data.inactive_accounts.length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <a href="/dashboard" className="text-lg font-semibold text-gray-900 hover:text-gray-700">SLIM Admin</a>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-medium text-gray-700">Alerts</h1>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 flex gap-6 text-sm">
          <a href="/dashboard" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Dashboard</a>
          <a href="/customers" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Customers</a>
          <a href="/alerts" className="py-2.5 border-b-2 border-gray-900 text-gray-900 font-medium">Alerts</a>
          <a href="/errors" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Errors</a>
          <a href="/audit" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Audit Log</a>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-3">
        {data.last_viewed && (
          <p className="text-xs text-gray-400 mb-2">
            Last checked: {new Date(data.last_viewed).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        )}

        {totalAlerts === 0 && data.high_usage.length === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <p className="text-green-800 font-medium">All clear. No alerts.</p>
          </div>
        )}

        {/* 1. Errors */}
        <Section title="Errors" count={data.errors.count_24h} color={errorColor as 'red' | 'yellow' | 'green'}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Last 24 hours</p>
              <p className="text-2xl font-semibold">{data.errors.count_24h}</p>
            </div>
            <div>
              <p className="text-gray-500">Last 7 days</p>
              <p className="text-2xl font-semibold">{data.errors.count_7d}</p>
            </div>
          </div>
          {data.errors.count_24h > 0 && (
            <a href="/errors?status=active" className="inline-block mt-3 text-sm text-blue-600 hover:underline">
              View error log →
            </a>
          )}
        </Section>

        {/* 2. Failed Payments */}
        <Section title="Failed Payments" count={data.failed_payments.length} color="red">
          {data.failed_payments.length === 0 ? (
            <p className="text-sm text-gray-500">No failed payments.</p>
          ) : (
            <table className="w-full text-sm mt-1">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-1 font-medium">Team</th>
                  <th className="pb-1 font-medium">Email</th>
                  <th className="pb-1 font-medium">Plan</th>
                  <th className="pb-1 font-medium">Days Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.failed_payments.map((fp) => (
                  <tr key={fp.team_id} className="cursor-pointer hover:bg-white/50" onClick={() => router.push(`/customers/${fp.team_id}`)}>
                    <td className="py-1.5 font-medium text-gray-900">{fp.team_name}</td>
                    <td className="py-1.5 text-gray-600">{fp.email}</td>
                    <td className="py-1.5 text-gray-600">{TIER_LABELS[fp.plan_tier] || fp.plan_tier}</td>
                    <td className="py-1.5 text-red-600 font-medium">{fp.days_overdue}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* 3. Trial Expiring Soon */}
        <Section title="Trial Expiring Soon" count={data.trial_expiring.length} color="yellow">
          {data.trial_expiring.length === 0 ? (
            <p className="text-sm text-gray-500">No trials expiring in the next 3 days.</p>
          ) : (
            <table className="w-full text-sm mt-1">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-1 font-medium">Team</th>
                  <th className="pb-1 font-medium">Email</th>
                  <th className="pb-1 font-medium">Days Left</th>
                  <th className="pb-1 font-medium">Lockboxes</th>
                </tr>
              </thead>
              <tbody>
                {data.trial_expiring.map((te) => (
                  <tr key={te.team_id} className="cursor-pointer hover:bg-white/50" onClick={() => router.push(`/customers/${te.team_id}`)}>
                    <td className="py-1.5 font-medium text-gray-900">{te.team_name}</td>
                    <td className="py-1.5 text-gray-600">{te.email}</td>
                    <td className="py-1.5 text-yellow-700 font-medium">{te.days_remaining}d</td>
                    <td className="py-1.5 text-gray-600">{te.lockboxes_added}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* 4. Pending Cancellations */}
        <Section title="Pending Cancellations" count={data.pending_cancellations.length} color="yellow">
          {data.pending_cancellations.length === 0 ? (
            <p className="text-sm text-gray-500">No pending cancellations.</p>
          ) : (
            <table className="w-full text-sm mt-1">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-1 font-medium">Team</th>
                  <th className="pb-1 font-medium">Email</th>
                  <th className="pb-1 font-medium">Plan</th>
                  <th className="pb-1 font-medium">Cancel Date</th>
                </tr>
              </thead>
              <tbody>
                {data.pending_cancellations.map((pc) => (
                  <tr key={pc.team_id} className="cursor-pointer hover:bg-white/50" onClick={() => router.push(`/customers/${pc.team_id}`)}>
                    <td className="py-1.5 font-medium text-gray-900">{pc.team_name}</td>
                    <td className="py-1.5 text-gray-600">{pc.email}</td>
                    <td className="py-1.5 text-gray-600">{TIER_LABELS[pc.plan_tier] || pc.plan_tier}</td>
                    <td className="py-1.5 text-yellow-700">{formatDate(pc.cancellation_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* 5. Inactive Accounts */}
        <Section title="Inactive Accounts (7+ days)" count={data.inactive_accounts.length} color="yellow">
          {data.inactive_accounts.length === 0 ? (
            <p className="text-sm text-gray-500">All accounts active in the last 7 days.</p>
          ) : (
            <table className="w-full text-sm mt-1">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-1 font-medium">Team</th>
                  <th className="pb-1 font-medium">Email</th>
                  <th className="pb-1 font-medium">Signup</th>
                  <th className="pb-1 font-medium">Days Inactive</th>
                  <th className="pb-1 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {data.inactive_accounts.map((ia) => (
                  <tr key={ia.team_id} className="cursor-pointer hover:bg-white/50" onClick={() => router.push(`/customers/${ia.team_id}`)}>
                    <td className="py-1.5 font-medium text-gray-900">{ia.team_name}</td>
                    <td className="py-1.5 text-gray-600">{ia.email}</td>
                    <td className="py-1.5 text-gray-600">{formatDate(ia.signup_date)}</td>
                    <td className="py-1.5 text-gray-700 font-medium">{ia.days_since_login}d</td>
                    <td className="py-1.5">
                      {ia.is_trial ? (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Trial</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Paid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* 6. High Usage */}
        <Section title="High Usage (Upsell Opportunity)" count={data.high_usage.length} color="green">
          {data.high_usage.length === 0 ? (
            <p className="text-sm text-gray-500">No customers above 80% usage.</p>
          ) : (
            <table className="w-full text-sm mt-1">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-1 font-medium">Team</th>
                  <th className="pb-1 font-medium">Usage</th>
                  <th className="pb-1 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody>
                {data.high_usage.map((hu) => (
                  <tr key={hu.team_id} className="cursor-pointer hover:bg-white/50" onClick={() => router.push(`/customers/${hu.team_id}`)}>
                    <td className="py-1.5 font-medium text-gray-900">{hu.team_name}</td>
                    <td className="py-1.5 text-green-700 font-medium">{hu.usage_text}</td>
                    <td className="py-1.5 text-gray-600">{TIER_LABELS[hu.plan_tier] || hu.plan_tier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </main>
    </div>
  )
}
