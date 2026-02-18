'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminNav } from '@/app/components/AdminNav'

interface Dispute {
  id: string
  stripe_dispute_id: string
  stripe_charge_id: string
  team_id: string
  team_name: string
  amount: number
  currency: string
  reason: string
  status: string
  evidence_due_by: string | null
  hours_remaining: number | null
  urgency: 'critical' | 'urgent' | 'warning' | 'normal'
  reminders_sent: { h48: boolean; h24: boolean; h6: boolean }
  resolved_at: string | null
  resolution_outcome: string | null
  created_at: string
}

interface Summary {
  total: number
  action_needed: number
  urgent: number
  by_status: Record<string, number>
}

const DISPUTE_REASON_LABELS: Record<string, string> = {
  bank_cannot_process: 'Bank Cannot Process',
  check_returned: 'Check Returned',
  credit_not_processed: 'Credit Not Processed',
  customer_initiated: 'Customer Initiated',
  debit_not_authorized: 'Debit Not Authorized',
  duplicate: 'Duplicate',
  fraudulent: 'Fraudulent',
  general: 'General',
  incorrect_account_details: 'Incorrect Account',
  insufficient_funds: 'Insufficient Funds',
  product_not_received: 'Product Not Received',
  product_unacceptable: 'Product Unacceptable',
  subscription_canceled: 'Subscription Canceled',
  unrecognized: 'Unrecognized',
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  needs_response:         { label: 'Needs Response',  bg: 'bg-red-100',    text: 'text-red-700' },
  warning_needs_response: { label: 'Needs Response',  bg: 'bg-red-100',    text: 'text-red-700' },
  under_review:           { label: 'Under Review',    bg: 'bg-yellow-100', text: 'text-yellow-700' },
  warning_under_review:   { label: 'Under Review',    bg: 'bg-yellow-100', text: 'text-yellow-700' },
  warning_closed:         { label: 'Closed',          bg: 'bg-gray-100',   text: 'text-gray-600' },
  prevented:              { label: 'Prevented',       bg: 'bg-blue-100',   text: 'text-blue-700' },
  won:                    { label: 'Won',             bg: 'bg-green-100',  text: 'text-green-700' },
  lost:                   { label: 'Lost',            bg: 'bg-gray-100',   text: 'text-gray-600' },
}

const URGENCY_ROW: Record<string, string> = {
  critical: 'bg-red-50',
  urgent:   'bg-orange-50',
  warning:  'bg-yellow-50/50',
  normal:   '',
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDeadline(hoursRemaining: number | null, evidenceDueBy: string | null): string {
  if (!evidenceDueBy) return '—'
  const date = formatDate(evidenceDueBy)
  if (hoursRemaining === null || hoursRemaining < 0) return `${date} (past)`
  if (hoursRemaining < 24) return `${date} (${hoursRemaining}h left)`
  const days = Math.floor(hoursRemaining / 24)
  return `${date} (${days}d left)`
}

const STATUS_FILTER_TABS = [
  { key: '',                label: 'All' },
  { key: 'needs_response',  label: 'Needs Response' },
  { key: 'under_review',    label: 'Under Review' },
  { key: 'won',             label: 'Won' },
  { key: 'lost',            label: 'Lost' },
]

export default function DisputesPage() {
  const router = useRouter()
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [adminRole, setAdminRole] = useState<string | null>(null)
  const [adminInfo, setAdminInfo] = useState<{ first_name: string; last_name: string; role: string } | null>(null)

  async function fetchDisputes(status: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/disputes/list${status ? `?status=${status}` : ''}`, { cache: 'no-store' })
      if (res.status === 401) { router.push('/login'); return }
      if (res.ok) {
        const data = await res.json()
        setDisputes(data.disputes)
        setSummary(data.summary)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDisputes('')
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.admin) { setAdminRole(d.admin.role); setAdminInfo(d.admin) }
    })
  }, [])

  async function handleStatusFilter(status: string) {
    setStatusFilter(status)
    await fetchDisputes(status)
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

      <AdminNav active="disputes" role={adminRole} />

      <main className="max-w-7xl mx-auto px-4 py-7">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Disputes & Chargebacks</h1>
            {summary && summary.action_needed > 0 && (
              <p className="text-sm text-red-600 mt-0.5">
                {summary.action_needed} dispute{summary.action_needed !== 1 ? 's' : ''} need response
                {summary.urgent > 0 && ` · ${summary.urgent} urgent (< 48h)`}
              </p>
            )}
          </div>
          {summary && (
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>{summary.total} total</span>
            </div>
          )}
        </div>

        {/* Urgent alert bar */}
        {summary && summary.urgent > 0 && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <span className="text-red-500 text-lg">⚠</span>
            <p className="text-sm text-red-800">
              <strong>{summary.urgent} dispute{summary.urgent !== 1 ? 's' : ''}</strong> have evidence deadlines within 48 hours.
              Respond before the deadline or the dispute will automatically be decided against you.
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Status filter tabs */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-1">
            {STATUS_FILTER_TABS.map(({ key, label }) => {
              const count = key === ''
                ? summary?.total
                : key === 'needs_response'
                  ? (summary?.by_status['needs_response'] || 0) + (summary?.by_status['warning_needs_response'] || 0)
                  : key === 'under_review'
                    ? (summary?.by_status['under_review'] || 0) + (summary?.by_status['warning_under_review'] || 0)
                    : summary?.by_status[key]
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
          ) : disputes.length === 0 ? (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">No disputes found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-2.5 font-medium text-gray-600">Customer</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Amount</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Reason</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Status</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Evidence Due</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Reminders</th>
                  <th className="px-5 py-2.5 font-medium text-gray-600">Created</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => {
                  const statusCfg = STATUS_CONFIG[d.status] ?? { label: d.status, bg: 'bg-gray-100', text: 'text-gray-600' }
                  const rowBg = URGENCY_ROW[d.urgency]
                  return (
                    <tr
                      key={d.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${rowBg}`}
                      onClick={() => router.push(`/customers/${d.team_id}`)}
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">{d.team_name}</td>
                      <td className="px-5 py-3 font-medium">{formatCents(d.amount, d.currency)}</td>
                      <td className="px-5 py-3 text-gray-600">
                        {DISPUTE_REASON_LABELS[d.reason] ?? d.reason}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {d.evidence_due_by ? (
                          <span className={`text-xs font-medium ${
                            d.urgency === 'critical' ? 'text-red-700' :
                            d.urgency === 'urgent'   ? 'text-orange-700' :
                            d.urgency === 'warning'  ? 'text-yellow-700' : 'text-gray-600'
                          }`}>
                            {formatDeadline(d.hours_remaining, d.evidence_due_by)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          {[
                            { label: '48h', sent: d.reminders_sent.h48 },
                            { label: '24h', sent: d.reminders_sent.h24 },
                            { label: '6h',  sent: d.reminders_sent.h6 },
                          ].map(({ label, sent }) => (
                            <span
                              key={label}
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                sent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                              }`}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(d.created_at)}</td>
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
