'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface ErrorEntry {
  id: string
  error_type: string | null
  error_message: string
  stack_trace: string | null
  endpoint: string | null
  request_method: string | null
  request_body: Record<string, unknown> | null
  user_agent: string | null
  ip_address: string | null
  status: string
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  team_id: string | null
  user_id: string | null
  teams: { id: string; name: string } | null
  users: { id: string; first_name: string; last_name: string; email: string } | null
}

function formatDateTime(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatRelative(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function ErrorsPage() {
  const router = useRouter()
  const [errors, setErrors] = useState<ErrorEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)

  // Filters
  const [status, setStatus] = useState('active')
  const [errorType, setErrorType] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchErrors = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (errorType) params.set('error_type', errorType)
    if (endpoint) params.set('endpoint', endpoint)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    params.set('page', String(page))

    try {
      const res = await fetch(`/api/errors/list?${params}`)
      if (!res.ok) {
        if (res.status === 401) { router.push('/login'); return }
        throw new Error('Failed')
      }
      const data = await res.json()
      setErrors(data.errors)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch {
      setErrors([])
    } finally {
      setLoading(false)
    }
  }, [status, errorType, endpoint, dateFrom, dateTo, page, router])

  useEffect(() => {
    fetchErrors()
  }, [fetchErrors])

  async function handleResolve(errorId: string) {
    setResolving(errorId)
    try {
      const res = await fetch('/api/errors/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorId }),
      })
      if (res.ok) {
        setErrors((prev) => prev.filter((e) => e.id !== errorId))
        setTotal((prev) => prev - 1)
        setExpandedId(null)
      }
    } catch {
      // ignore
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <a href="/dashboard" className="text-lg font-semibold text-gray-900 hover:text-gray-700">SLIM Admin</a>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-medium text-gray-700">Error Log</h1>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 flex gap-6 text-sm">
          <a href="/dashboard" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Dashboard</a>
          <a href="/customers" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Customers</a>
          <a href="/alerts" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Alerts</a>
          <a href="/errors" className="py-2.5 border-b-2 border-gray-900 text-gray-900 font-medium">Errors</a>
          <a href="/audit" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Audit Log</a>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
              <option value="">All</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Error Type</label>
            <input
              type="text"
              value={errorType}
              onChange={(e) => { setErrorType(e.target.value); setPage(1) }}
              placeholder="e.g. TypeError"
              className="w-36 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Endpoint</label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => { setEndpoint(e.target.value); setPage(1) }}
              placeholder="e.g. /api/lockboxes"
              className="w-40 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
          <span className="text-sm text-gray-500 ml-auto pb-1">
            {total} error{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600 w-36">Timestamp</th>
                <th className="px-4 py-3 font-medium text-gray-600 w-28">Type</th>
                <th className="px-4 py-3 font-medium text-gray-600">Message</th>
                <th className="px-4 py-3 font-medium text-gray-600 w-36">Endpoint</th>
                <th className="px-4 py-3 font-medium text-gray-600 w-28">Team</th>
                <th className="px-4 py-3 font-medium text-gray-600 w-20">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : errors.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No errors found.</td></tr>
              ) : (
                errors.map((e) => (
                  <tr key={e.id} className="group">
                    {/* Main row */}
                    <td colSpan={6} className="p-0">
                      <div
                        onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                        className="flex items-center cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <div className="px-4 py-2.5 w-36 shrink-0">
                          <span className="text-gray-500" title={formatDateTime(e.created_at)}>
                            {formatRelative(e.created_at)}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 w-28 shrink-0">
                          <span className="bg-red-50 text-red-700 text-xs px-1.5 py-0.5 rounded font-medium truncate block">
                            {e.error_type || 'Error'}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 flex-1 min-w-0">
                          <span className="text-gray-900 truncate block">{e.error_message}</span>
                        </div>
                        <div className="px-4 py-2.5 w-36 shrink-0 text-gray-500 truncate">
                          {e.endpoint || '—'}
                        </div>
                        <div className="px-4 py-2.5 w-28 shrink-0">
                          {e.teams ? (
                            <a
                              href={`/customers/${e.teams.id}`}
                              onClick={(ev) => ev.stopPropagation()}
                              className="text-blue-600 hover:underline truncate block"
                            >
                              {e.teams.name}
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                        <div className="px-4 py-2.5 w-20 shrink-0">
                          {e.status === 'active' ? (
                            <span className="text-xs font-medium text-red-600">Active</span>
                          ) : (
                            <span className="text-xs font-medium text-gray-400">Resolved</span>
                          )}
                        </div>
                      </div>

                      {/* Expanded details */}
                      {expandedId === e.id && (
                        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                            <div>
                              <p className="text-xs text-gray-500">Full Timestamp</p>
                              <p className="font-medium">{formatDateTime(e.created_at)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Method</p>
                              <p className="font-medium">{e.request_method || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">User</p>
                              <p className="font-medium">{e.users ? `${[e.users.first_name, e.users.last_name].filter(Boolean).join(' ')} (${e.users.email})` : '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">IP Address</p>
                              <p className="font-medium">{e.ip_address || '—'}</p>
                            </div>
                          </div>

                          {e.user_agent && (
                            <div className="mb-3">
                              <p className="text-xs text-gray-500 mb-1">User Agent</p>
                              <p className="text-xs text-gray-600 bg-white rounded px-2 py-1 border border-gray-200 break-all">{e.user_agent}</p>
                            </div>
                          )}

                          {e.request_body && Object.keys(e.request_body).length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs text-gray-500 mb-1">Request Body (sanitized)</p>
                              <pre className="text-xs text-gray-700 bg-white rounded px-3 py-2 border border-gray-200 overflow-x-auto font-mono">
                                {JSON.stringify(e.request_body, null, 2)}
                              </pre>
                            </div>
                          )}

                          {e.stack_trace && (
                            <div className="mb-3">
                              <p className="text-xs text-gray-500 mb-1">Stack Trace</p>
                              <pre className="text-xs text-gray-700 bg-white rounded px-3 py-2 border border-gray-200 overflow-x-auto font-mono max-h-60 overflow-y-auto whitespace-pre-wrap">
                                {e.stack_trace}
                              </pre>
                            </div>
                          )}

                          <div className="flex items-center gap-3 mt-3">
                            {e.status === 'active' && (
                              <button
                                onClick={() => handleResolve(e.id)}
                                disabled={resolving === e.id}
                                className="px-3 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
                              >
                                {resolving === e.id ? 'Resolving...' : 'Mark as Resolved'}
                              </button>
                            )}
                            {e.status === 'resolved' && (
                              <span className="text-xs text-gray-500">
                                Resolved {formatDateTime(e.resolved_at)}
                              </span>
                            )}
                            {e.teams && (
                              <a
                                href={`/customers/${e.teams.id}`}
                                className="text-sm text-blue-600 hover:underline"
                              >
                                View customer →
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

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
