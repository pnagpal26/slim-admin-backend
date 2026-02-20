'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface PromoCode {
  id: string
  code: string
  description: string | null
  type: 'extended_trial' | 'subscription_discount'
  free_days: number | null
  discount_percent: number | null
  duration_months: number | null
  max_redemptions: number | null
  current_redemptions: number
  expires_at: string | null
  is_active: boolean
  created_at: string
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function valueLabel(pc: PromoCode): string {
  if (pc.type === 'extended_trial') return `+${pc.free_days} days`
  return `${pc.discount_percent}% off / ${pc.duration_months}mo`
}

export default function PromoCodesPage() {
  const router = useRouter()
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [admin, setAdmin] = useState<{ role: string; first_name: string; last_name: string } | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)

  const canCreate = admin?.role === 'super_admin' || admin?.role === 'support_l2'

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (typeFilter) params.set('type', typeFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (search) params.set('search', search)

    const [adminRes, codesRes] = await Promise.all([
      fetch('/api/auth/me'),
      fetch(`/api/promo-codes/list?${params}`),
    ])

    if (!adminRes.ok) { router.push('/login'); return }
    const adminData = await adminRes.json()
    setAdmin(adminData.admin)

    if (codesRes.ok) {
      const data = await codesRes.json()
      setPromoCodes(data.promo_codes || [])
      setTotal(data.total || 0)
    }
    setLoading(false)
  }, [router, typeFilter, statusFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const roleLabel: Record<string, string> = { super_admin: 'Super Admin', support_l1: 'Support L1', support_l2: 'Support L2' }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0D7377]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-lg font-semibold text-white hover:text-white/90">SLIM Admin</a>
            <span className="text-white/40">/</span>
            <h1 className="text-lg font-medium text-white/90">Promo Codes</h1>
          </div>
          {admin && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/80">
                {[admin.first_name, admin.last_name].filter(Boolean).join(' ')} <span className="text-white/60">({roleLabel[admin.role] || admin.role})</span>
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
          <a href="/audit" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Audit Log</a>
          <a href="/promo-codes" className="py-2.5 border-b-2 border-[#0D7377] text-[#0D7377] font-medium">Promo Codes</a>
          {admin?.role === 'super_admin' && (
            <a href="/admin-users" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Admin Users</a>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">All Promo Codes</h2>
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{total}</span>
          </div>
          {canCreate && (
            <button
              onClick={() => router.push('/promo-codes/create')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              + Create Promo Code
            </button>
          )}
        </div>

      <div className="px-0">
        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="extended_trial">Extended Trial</option>
            <option value="subscription_discount">Subscription Discount</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button onClick={fetchData} className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-200">
            Apply
          </button>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm py-8 text-center">Loading...</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Value</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Redemptions</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Expires</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {promoCodes.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">No promo codes found</td></tr>
                ) : promoCodes.map(pc => (
                  <tr
                    key={pc.id}
                    onClick={() => router.push(`/promo-codes/${pc.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">{pc.code}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {pc.type === 'extended_trial' ? 'Trial Extension' : 'Subscription Discount'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{valueLabel(pc)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {pc.current_redemptions}{pc.max_redemptions ? ` / ${pc.max_redemptions}` : ''}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(pc.expires_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pc.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {pc.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(pc.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  </div>
  )
}
