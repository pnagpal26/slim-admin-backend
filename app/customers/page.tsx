'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Customer {
  id: string
  team_name: string
  contact_email: string
  contact_name: string
  plan_tier: string
  billing_exempt: boolean
  signup_date: string
  last_login: string | null
  status: string
  member_count: number
}

const PLAN_TIERS = [
  { value: '', label: 'All Plans' },
  { value: 'free_trial', label: 'Free Trial' },
  { value: 'solo', label: 'Solo Agent' },
  { value: 'small', label: 'Small Team' },
  { value: 'medium', label: 'Medium Team' },
  { value: 'enterprise', label: 'Enterprise' },
]

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'active_trial', label: 'Active Trial' },
  { value: 'active_paid', label: 'Active Paid' },
  { value: 'past_due', label: 'Past Due' },
  { value: 'pending_cancellation', label: 'Pending Cancellation' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_COLORS: Record<string, string> = {
  active_trial: 'bg-blue-100 text-blue-800',
  active_paid: 'bg-green-100 text-green-800',
  past_due: 'bg-red-100 text-red-800',
  pending_cancellation: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

const STATUS_LABELS: Record<string, string> = {
  active_trial: 'Active Trial',
  active_paid: 'Active Paid',
  past_due: 'Past Due',
  pending_cancellation: 'Pending Cancel',
  cancelled: 'Cancelled',
}

const TIER_LABELS: Record<string, string> = {
  free_trial: 'Free Trial',
  solo: 'Solo',
  small: 'Small Team',
  medium: 'Medium Team',
  enterprise: 'Enterprise',
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelative(d: string | null): string {
  if (!d) return 'Never'
  const now = Date.now()
  const then = new Date(d).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(d)
}

export default function CustomersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [planTier, setPlanTier] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('signup_date')
  const [order, setOrder] = useState('desc')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [successMessage, setSuccessMessage] = useState('')

  // Show success message if redirected after deletion
  useEffect(() => {
    if (searchParams.get('deleted') === '1') {
      setSuccessMessage('Customer deleted successfully')
      // Clear the URL parameter without refresh
      window.history.replaceState({}, '', '/customers')
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => setSuccessMessage(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (planTier) params.set('plan_tier', planTier)
    if (status) params.set('status', status)
    params.set('sort', sort)
    params.set('order', order)
    params.set('page', String(page))
    params.set('_t', String(Date.now())) // Cache buster

    try {
      const res = await fetch(`/api/customers/list?${params}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      })
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login')
          return
        }
        throw new Error('Failed to fetch')
      }
      const data = await res.json()
      setCustomers(data.customers)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch {
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [search, planTier, status, sort, order, page, router])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // Debounced search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  function handleSort(field: string) {
    if (sort === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(field)
      setOrder('desc')
    }
    setPage(1)
  }

  function sortIndicator(field: string) {
    if (sort !== field) return ''
    return order === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-lg font-semibold text-gray-900 hover:text-gray-700">
              SLIM Admin
            </a>
            <span className="text-gray-300">/</span>
            <h1 className="text-lg font-medium text-gray-700">Customers</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Success message */}
        {successMessage && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded flex items-center justify-between">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage('')} className="text-green-700 hover:text-green-900">
              &times;
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by team name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-72 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select
            value={planTier}
            onChange={(e) => { setPlanTier(e.target.value); setPage(1) }}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PLAN_TIERS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500 ml-auto">
            {total} customer{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">Team Name</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Contact Email</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Plan</th>
                  <th
                    className="px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort('signup_date')}
                  >
                    Signup Date{sortIndicator('signup_date')}
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => handleSort('last_login')}
                  >
                    Last Login{sortIndicator('last_login')}
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      No customers found.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/customers/${c.id}`)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{c.team_name}</td>
                      <td className="px-4 py-3 text-gray-600">{c.contact_email}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {TIER_LABELS[c.plan_tier] || c.plan_tier}
                        {c.billing_exempt && (
                          <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                            exempt
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(c.signup_date)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatRelative(c.last_login)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABELS[c.status] || c.status}
                        </span>
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
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
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
