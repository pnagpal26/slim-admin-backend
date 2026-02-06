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

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'moved', label: 'Moved' },
  { value: 'code_viewed', label: 'Code Viewed' },
  { value: 'photo_uploaded', label: 'Photo Uploaded' },
  { value: 'extend_trial', label: 'Extend Trial (Admin)' },
  { value: 'comp_month', label: 'Comp Month (Admin)' },
  { value: 'resolve_error', label: 'Resolve Error (Admin)' },
  { value: 'login', label: 'Admin Login' },
]

export default function AuditPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [exporting, setExporting] = useState(false)

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
      const res = await fetch(`/api/audit/list?${params}`)
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <a href="/dashboard" className="text-lg font-semibold text-gray-900 hover:text-gray-700">SLIM Admin</a>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-medium text-gray-700">Audit History</h1>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 flex gap-6 text-sm">
          <a href="/dashboard" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Dashboard</a>
          <a href="/customers" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Customers</a>
          <a href="/alerts" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Alerts</a>
          <a href="/errors" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Errors</a>
          <a href="/audit" className="py-2.5 border-b-2 border-gray-900 text-gray-900 font-medium">Audit Log</a>
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
                  className="w-44 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="rounded border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">Loading...</td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No entries found.</td></tr>
                ) : (
                  entries.map((e) => (
                    <tr key={`${e.source}-${e.id}`} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                        {formatDateTime(e.timestamp)}
                      </td>
                      <td className="px-4 py-2.5">
                        {e.team ? (
                          <a href={`/customers/${e.team.id}`} className="text-blue-600 hover:underline truncate block">
                            {e.team.name}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 truncate">
                        {e.user ? [e.user.first_name, e.user.last_name].filter(Boolean).join(' ') : '—'}
                        {e.source === 'admin' && (
                          <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1 py-0.5 rounded">admin</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">
                          {e.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs max-w-sm">
                        {e.reason && (
                          <span className="text-gray-700 block mb-0.5">Reason: {e.reason}</span>
                        )}
                        {e.lockbox_id && (
                          <span className="text-gray-500 block">Lockbox: {e.lockbox_id}</span>
                        )}
                        {e.details && !e.reason && (
                          <span className="truncate block">{JSON.stringify(e.details)}</span>
                        )}
                        {!e.details && !e.reason && !e.lockbox_id && '—'}
                      </td>
                    </tr>
                  ))
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
