'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface AuditEntry {
  id: string
  source: 'customer' | 'admin'
  timestamp: string
  action: string
  user: { id: string; first_name: string; last_name: string; email: string } | null
  team: { id: string; name: string } | null
  lockbox_id: string | null
  details: Record<string, unknown> | null
  action_method: string | null
  reason?: string | null
}

function formatDateTime(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatAuditDetails(action: string, details: Record<string, unknown> | null, lockboxId: string | null, reason: string | null | undefined): string {
  const parts: string[] = []

  if (reason) {
    parts.push(`Reason: ${reason}`)
  }

  if (lockboxId) {
    parts.push(`Lockbox: ${lockboxId}`)
  }

  if (!details) return parts.join(' | ') || '—'

  // Helper to get a string value from details
  const str = (key: string) => {
    const v = details[key]
    return typeof v === 'string' ? v : null
  }

  // Helper: extract address from details (various field names)
  const addr = () => str('current_address') || str('address') || str('property_address')

  switch (action) {
    // ---- Lockbox actions ----
    case 'installed':
      if (addr()) parts.push(`at ${addr()}`)
      break
    case 'code_viewed':
      break
    case 'code_changed':
      if (str('reason')) parts.push(`Reason: ${str('reason')!.replace(/_/g, ' ')}`)
      break
    case 'checked_out':
      if (addr()) parts.push(`at ${addr()}`)
      break
    case 'checked_in':
      if (addr()) parts.push(`at ${addr()}`)
      break
    case 'removed':
    case 'deleted':
      break
    case 'out_of_service':
      if (str('out_of_service_reason')) parts.push(`Reason: ${str('out_of_service_reason')!.replace(/_/g, ' ')}`)
      break
    case 'photo_uploaded':
      if (details.photo_count) parts.push(`${details.photo_count} photo(s)`)
      break
    case 'created':
      if (addr()) parts.push(`at ${addr()}`)
      break
    case 'updated':
    case 'moved':
      if (str('field')) parts.push(`Field: ${str('field')}`)
      if (str('from') && str('to')) {
        parts.push(`${str('from')} → ${str('to')}`)
      } else if (addr()) {
        parts.push(`at ${addr()}`)
      }
      break

    // ---- User account actions ----
    case 'phone_verified':
    case 'phone_changed':
      break
    case 'invitation_cancelled':
    case 'invitation_resent':
      if (str('email')) parts.push(`Email: ${str('email')}`)
      break

    // ---- Auth actions ----
    case 'login':
      if (str('ip') || str('ip_address')) {
        parts.push(`IP: ${str('ip') || str('ip_address')}`)
      }
      break
    case 'logout':
    case 'account_setup':
      break

    // ---- Admin customer actions ----
    case 'extend_trial':
      if (details.days_added) parts.push(`Extended by ${details.days_added} days`)
      if (str('team_name')) parts.push(`Team: ${str('team_name')}`)
      break
    case 'comp_month':
      if (details.days_added) parts.push(`${details.days_added} days added`)
      if (str('team_name')) parts.push(`Team: ${str('team_name')}`)
      if (details.stripe_synced === false) parts.push('Stripe sync failed')
      break
    case 'update_customer':
      if (str('team_name')) parts.push(`Team: ${str('team_name')}`)
      break
    case 'delete_customer':
      if (str('team_name')) parts.push(`Deleted: ${str('team_name')}`)
      if (details.lockbox_count) parts.push(`${details.lockbox_count} lockbox(es)`)
      break
    case 'resolve_error':
      if (str('error_message') || str('message')) {
        parts.push(`Error: ${(str('error_message') || str('message') || '').slice(0, 60)}`)
      }
      break

    // ---- Admin user management ----
    case 'invite_admin':
      if (str('invited_email')) parts.push(`Invited: ${str('invited_email')}`)
      if (str('invited_role')) parts.push(`Role: ${str('invited_role')}`)
      if (details.email_sent === true) parts.push('Email sent')
      if (details.email_sent === false) parts.push('Email failed')
      break
    case 'deactivate_admin':
      if (str('deactivated_email')) parts.push(`Deactivated: ${str('deactivated_email')}`)
      break
    case 'reactivate_admin':
      if (str('reactivated_email')) parts.push(`Reactivated: ${str('reactivated_email')}`)
      break
    case 'edit_admin': {
      if (str('edited_email')) parts.push(`Edited: ${str('edited_email')}`)
      const changes = details.changes as Record<string, { from: unknown; to: unknown }> | null
      if (changes) {
        const fields = Object.keys(changes).map(k => k.replace(/_/g, ' ')).join(', ')
        parts.push(`Changed: ${fields}`)
      }
      break
    }
    case 'change_role_admin':
      if (str('target_email') || str('changed_email')) parts.push(str('target_email') || str('changed_email')!)
      if ((str('previous_role') || str('old_role')) && (str('new_role'))) {
        parts.push(`${str('previous_role') || str('old_role')} → ${str('new_role')}`)
      }
      break
    case 'delete_admin':
      if (str('deleted_email')) parts.push(`Deleted: ${str('deleted_email')}`)
      break

    default:
      // Show a clean summary: pick readable keys, skip nested objects and IDs
      {
        const skipKeys = new Set(['id', 'team_id', 'user_id', 'lockbox_id', 'created_at', 'updated_at', 'target_id', 'invited_by'])
        const summary = Object.entries(details)
          .filter(([k, v]) => v !== null && v !== undefined && typeof v !== 'object' && !skipKeys.has(k))
          .slice(0, 3)
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
          .join(', ')
        if (summary) parts.push(summary)
      }
      break
  }

  return parts.join(' | ') || '—'
}

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'moved', label: 'Moved' },
  { value: 'installed', label: 'Installed' },
  { value: 'checked_out', label: 'Checked Out' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'removed', label: 'Removed' },
  { value: 'out_of_service', label: 'Out of Service' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'code_viewed', label: 'Code Viewed' },
  { value: 'code_changed', label: 'Code Changed' },
  { value: 'photo_uploaded', label: 'Photo Uploaded' },
  { value: 'extend_trial', label: 'Extend Trial (Admin)' },
  { value: 'comp_month', label: 'Comp Month (Admin)' },
  { value: 'delete_customer', label: 'Delete Customer (Admin)' },
  { value: 'resolve_error', label: 'Resolve Error (Admin)' },
  { value: 'invite_admin', label: 'Invite Admin' },
  { value: 'deactivate_admin', label: 'Deactivate Admin' },
  { value: 'reactivate_admin', label: 'Reactivate Admin' },
  { value: 'delete_admin', label: 'Delete Admin' },
  { value: 'login', label: 'Login' },
]

const ROLE_LABELS: Record<string, string> = { super_admin: 'Super Admin', support_l1: 'Support L1', support_l2: 'Support L2' }

export default function AuditPage() {
  const router = useRouter()
  const [admin, setAdmin] = useState<{ first_name: string; last_name: string; role: string } | null>(null)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => { if (d) setAdmin(d.admin) }).catch(() => {})
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  // Filters
  const [teamId, setTeamId] = useState('')
  const [actionType, setActionType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Team search for filter
  const [teamSearch, setTeamSearch] = useState('')
  const [teamOptions, setTeamOptions] = useState<{ id: string; name: string }[]>([])
  const [selectedTeamName, setSelectedTeamName] = useState('')

  function buildParams(): URLSearchParams {
    const params = new URLSearchParams()
    if (teamId) params.set('team_id', teamId)
    if (actionType) params.set('action_type', actionType)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    return params
  }

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const params = buildParams()
    params.set('page', String(page))

    try {
      const res = await fetch(`/api/audit/list?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return }
        throw new Error('Failed')
      }
      const data = await res.json()
      setEntries(data.entries)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, actionType, dateFrom, dateTo, page, router])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // Team search debounce
  useEffect(() => {
    if (!teamSearch.trim()) { setTeamOptions([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/list?search=${encodeURIComponent(teamSearch)}&page=1`)
        if (res.ok) {
          const data = await res.json()
          setTeamOptions(data.customers.map((c: { id: string; team_name: string }) => ({
            id: c.id,
            name: c.team_name,
          })).slice(0, 8))
        }
      } catch { /* ignore */ }
    }, 300)
    return () => clearTimeout(timer)
  }, [teamSearch])

  async function handleExport() {
    setExporting(true)
    try {
      const params = buildParams()
      const res = await fetch(`/api/audit/export?${params}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-export-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  function toggleExpanded(entryKey: string) {
    setExpandedId(expandedId === entryKey ? null : entryKey)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0D7377]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-lg font-semibold text-white hover:text-white/90">SLIM Admin</a>
            <span className="text-white/40">/</span>
            <h1 className="text-lg font-medium text-white/90">Audit History</h1>
          </div>
          {admin && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/80">
                {[admin.first_name, admin.last_name].filter(Boolean).join(' ')} <span className="text-white/60">({ROLE_LABELS[admin.role] || admin.role})</span>
              </span>
              <button onClick={handleLogout} className="text-sm text-white/70 hover:text-white transition-colors">Sign out</button>
            </div>
          )}
        </div>
      </header>

      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 flex gap-6 text-sm">
          <a href="/dashboard" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Dashboard</a>
          <a href="/customers" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Customers</a>
          <a href="/alerts" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Alerts</a>
          <a href="/errors" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Errors</a>
          <a href="/audit" className="py-2.5 border-b-2 border-[#0D7377] text-[#0D7377] font-medium">Audit Log</a>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="relative">
            <label className="block text-xs text-gray-500 mb-1">Team</label>
            {selectedTeamName ? (
              <div className="flex items-center gap-2 rounded border border-gray-300 px-3 py-1.5 text-sm bg-white">
                <span className="text-gray-900">{selectedTeamName}</span>
                <button
                  onClick={() => { setTeamId(''); setSelectedTeamName(''); setTeamSearch('') }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  placeholder="Search team..."
                  className="w-44 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
                />
                {teamOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                    {teamOptions.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTeamId(t.id)
                          setSelectedTeamName(t.name)
                          setTeamSearch('')
                          setTeamOptions([])
                          setPage(1)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Action Type</label>
            <select
              value={actionType}
              onChange={(e) => { setActionType(e.target.value); setPage(1) }}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
            >
              {ACTION_TYPES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
            />
          </div>
          <div className="ml-auto flex items-end gap-3">
            <span className="text-sm text-gray-500 pb-1">
              {total} entr{total !== 1 ? 'ies' : 'y'}
            </span>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600 w-40">Timestamp</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-32">Team</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-32">User</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-32">Action</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Details</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Loading...</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No entries found.</td></tr>
                ) : (
                  entries.map((e) => {
                    const entryKey = `${e.source}-${e.id}`
                    const isExpanded = expandedId === entryKey
                    const hasRawData = e.details && Object.keys(e.details).length > 0

                    return (
                      <tr key={entryKey} className="group">
                        <td colSpan={6} className="p-0">
                          {/* Main row */}
                          <div className="flex items-center hover:bg-gray-50 transition-colors">
                            <div className="px-4 py-2.5 w-40 shrink-0 text-gray-500 whitespace-nowrap">
                              {formatDateTime(e.timestamp)}
                            </div>
                            <div className="px-4 py-2.5 w-32 shrink-0">
                              {e.team ? (
                                <a href={`/customers/${e.team.id}`} className="text-blue-600 hover:underline truncate block">
                                  {e.team.name}
                                </a>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                            <div className="px-4 py-2.5 w-32 shrink-0 text-gray-600 truncate">
                              {e.user ? [e.user.first_name, e.user.last_name].filter(Boolean).join(' ') : '—'}
                              {e.source === 'admin' && (
                                <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1 py-0.5 rounded">admin</span>
                              )}
                            </div>
                            <div className="px-4 py-2.5 w-32 shrink-0">
                              <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">
                                {e.action}
                              </span>
                            </div>
                            <div className="px-4 py-2.5 flex-1 min-w-0 text-gray-600 text-xs truncate">
                              {formatAuditDetails(e.action, e.details, e.lockbox_id, e.reason)}
                            </div>
                            <div className="px-4 py-2.5 w-16 shrink-0 text-right">
                              {hasRawData && (
                                <button
                                  onClick={() => toggleExpanded(entryKey)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                  title="View raw JSON"
                                >
                                  {isExpanded ? '▲' : '▼'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Expanded raw JSON */}
                          {isExpanded && hasRawData && (
                            <div className="px-4 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
                              <p className="text-xs text-gray-500 mb-1 font-medium">Raw Details</p>
                              <pre className="text-xs text-gray-700 bg-white rounded px-3 py-2 border border-gray-200 overflow-x-auto font-mono max-h-48 overflow-y-auto whitespace-pre-wrap select-all">
                                {JSON.stringify(e.details, null, 2)}
                              </pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
