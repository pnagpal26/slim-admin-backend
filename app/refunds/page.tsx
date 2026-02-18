'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminNav } from '@/app/components/AdminNav'

interface Refund {
  id: string
  stripe_refund_id: string
  stripe_charge_id: string
  team_id: string
  team_name: string
  amount_refunded: number
  currency: string
  reason: string | null
  status: string
  created_at: string
}

interface Summary {
  total: number
  total_amount_succeeded: number
  by_status: Record<string, number>
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  succeeded: { label: 'Succeeded', bg: 'bg-green-100',  text: 'text-green-700' },
  pending:   { label: 'Pending',   bg: 'bg-yellow-100', text: 'text-yellow-700' },
  failed:    { label: 'Failed',    bg: 'bg-red-100',    text: 'text-red-700' },
  canceled:  { label: 'Canceled',  bg: 'bg-gray-100',   text: 'text-gray-600' },
}

const REFUND_REASON_LABELS: Record<string, string> = {
  duplicate: 'Duplicate',
  fraudulent: 'Fraudulent',
  requested_by_customer: 'Customer Request',
  expired_uncaptured_charge: 'Uncaptured Charge',
  unknown: 'Unknown',
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_FILTER_TABS = [
  { key: '',          label: 'All' },
  { key: 'succeeded', label: 'Succeeded' },
  { key: 'pending',   label: 'Pending' },
  { key: 'failed',    label: 'Failed' },
  { key: 'canceled',  label: 'Canceled' },
]

export default function RefundsPage() {
  const router = useRouter()
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [adminRole, setAdminRole] = useState<string | null>(null)
  const [adminInfo, setAdminInfo] = useState<{ first_name: string; last_name: string; role: string } | null>(null)

  async function fetchRefunds(status: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/refunds/list${status ? `?status=${status}` : ''}`, { cache: 'no-store' })
      if (res.status === 401) { router.push('/login'); return }
      if (res.ok) {
        const data = await res.json()
        setRefunds(data.refunds)
        setSummary(data.summary)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRefunds('')
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.admin) { setAdminRole(d.admin.role); setAdminInfo(d.admin) }
    })
  }, [])

  async function handleStatusFilter(status: string) {
    setStatusFilter(status)
    await fetchRefunds(status)
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0D7377]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-white font-semibold">SLIM Admin</span>
          {adminInfo && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/80">
                {[adminInfo.first_name, adminInfo.last_name].filter(Boolean).join(' ')}
              </span>
              <button onClick={handleLogout} className="text-sm text-white/70 hover:text-white">
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <AdminNav active="refunds" role={adminRole} />

      <main className="max-w-7xl mx-auto px-4 py-7">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Refunds</h1>
            {summary && summary.total_amount_succeeded > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {formatCents(summary.total_amount_succeeded, 'usd')} refunded (succeeded)
              </p>
            )}
          </div>
          {summary && (
            <span className="text-sm text-gray-500">{summary.total} total</span>
          )}
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Status filter tabs */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-1">
            {STATUS_FILTER_TABS.map(({ key, label }) => {
              const count = key === '' ? summary?.total : summary?.by_status[key]
              return (
                <button
                  key={key}
                  onClick={() => handleStatusFilter(key)}
                  className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                    statusFilter === key
                      ? 'bg-[#0D7377] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="ml-1.5 opacity-75">({count})</span>
                  )}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">Loading...</div>
          ) : refunds.length === 0 ? (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">No refunds found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-2.5 font-medium text-gray-600">Customer</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Amount</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Reason</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Status</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Refund ID</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => {
                  const statusCfg = STATUS_CONFIG[r.status] ?? { label: r.status, bg: 'bg-gray-100', text: 'text-gray-600' }
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/customers/${r.team_id}`)}
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">{r.team_name}</td>
                      <td className="px-5 py-3 font-medium">{formatCents(r.amount_refunded, r.currency)}</td>
                      <td className="px-5 py-3 text-gray-600">
                        {r.reason ? (REFUND_REASON_LABELS[r.reason] ?? r.reason) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">{r.stripe_refund_id}</td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
