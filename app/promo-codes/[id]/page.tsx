'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface PromoCode {
  id: string
  code: string
  description: string | null
  type: 'extended_trial' | 'subscription_discount'
  free_days: number | null
  discount_percent: number | null
  duration_months: number | null
  stripe_coupon_id: string | null
  stripe_promotion_code_id: string | null
  max_redemptions: number | null
  current_redemptions: number
  expires_at: string | null
  valid_plans: string[] | null
  new_customers_only: boolean
  one_per_customer: boolean
  is_active: boolean
  created_at: string
}

interface Redemption {
  id: string
  status: string
  applied_to: string | null
  plan: string | null
  redeemed_at: string
  subscription_applied_at: string | null
  applied_by_admin_id: string | null
  teams: { id: string; name: string } | null
  users: { id: string; first_name: string; last_name: string; email: string } | null
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PromoCodeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [promoCode, setPromoCode] = useState<PromoCode | null>(null)
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [loading, setLoading] = useState(true)
  const [admin, setAdmin] = useState<{ role: string } | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editMaxRedemptions, setEditMaxRedemptions] = useState('')
  const [editExpiresAt, setEditExpiresAt] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [deactivating, setDeactivating] = useState(false)

  const canEdit = admin?.role === 'super_admin' || admin?.role === 'support_l2'

  useEffect(() => {
    const fetchData = async () => {
      const [adminRes, dataRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch(`/api/promo-codes/detail?id=${id}`),
      ])
      if (!adminRes.ok) { router.push('/login'); return }
      const adminData = await adminRes.json()
      setAdmin(adminData.admin)
      if (dataRes.ok) {
        const data = await dataRes.json()
        setPromoCode(data.promo_code)
        setRedemptions(data.redemptions || [])
      }
      setLoading(false)
    }
    fetchData()
  }, [id, router])

  const openEditModal = () => {
    if (!promoCode) return
    setEditMaxRedemptions(promoCode.max_redemptions?.toString() || '')
    setEditExpiresAt(promoCode.expires_at ? new Date(promoCode.expires_at).toISOString().slice(0, 16) : '')
    setEditError('')
    setShowEditModal(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEditLoading(true)
    setEditError('')
    const res = await fetch('/api/promo-codes/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        max_redemptions: editMaxRedemptions ? parseInt(editMaxRedemptions) : null,
        expires_at: editExpiresAt || null,
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      setEditError(data.error || 'Failed to update')
      setEditLoading(false)
      return
    }
    setShowEditModal(false)
    setEditLoading(false)
    // Refresh
    const dataRes = await fetch(`/api/promo-codes/detail?id=${id}`)
    if (dataRes.ok) {
      const data = await dataRes.json()
      setPromoCode(data.promo_code)
    }
  }

  const handleDeactivate = async () => {
    if (!confirm(`Deactivate promo code ${promoCode?.code}? This cannot be undone.`)) return
    setDeactivating(true)
    const res = await fetch('/api/promo-codes/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      const dataRes = await fetch(`/api/promo-codes/detail?id=${id}`)
      if (dataRes.ok) { const data = await dataRes.json(); setPromoCode(data.promo_code) }
    }
    setDeactivating(false)
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading...</div>
  if (!promoCode) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Not found</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0D7377]">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-white/70 mb-1">
                <a href="/dashboard" className="hover:text-white">SLIM Admin</a>
                <span>/</span>
                <a href="/promo-codes" className="hover:text-white">Promo Codes</a>
                <span>/</span>
                <span className="text-white font-mono">{promoCode.code}</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-white font-mono">{promoCode.code}</h1>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${promoCode.is_active ? 'bg-green-400/20 text-green-100' : 'bg-white/20 text-white/70'}`}>
                  {promoCode.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <button onClick={openEditModal} className="px-3 py-1.5 text-sm rounded border border-white/30 text-white bg-white/15 hover:bg-white/25 transition-colors">Edit</button>
                {promoCode.is_active && (
                  <button onClick={handleDeactivate} disabled={deactivating} className="px-3 py-1.5 text-sm rounded bg-red-500/80 text-white hover:bg-red-500 transition-colors disabled:opacity-50">
                    {deactivating ? 'Deactivating...' : 'Deactivate'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Code Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Code Settings</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Type</span><p className="font-medium mt-0.5">{promoCode.type === 'extended_trial' ? 'Extended Trial' : 'Subscription Discount'}</p></div>
            {promoCode.type === 'extended_trial' && (
              <div><span className="text-gray-500">Free Days</span><p className="font-medium mt-0.5">{promoCode.free_days}</p></div>
            )}
            {promoCode.type === 'subscription_discount' && (
              <>
                <div><span className="text-gray-500">Discount</span><p className="font-medium mt-0.5">{promoCode.discount_percent}% off</p></div>
                <div><span className="text-gray-500">Duration</span><p className="font-medium mt-0.5">{promoCode.duration_months} months</p></div>
                {promoCode.stripe_coupon_id && <div><span className="text-gray-500">Stripe Coupon</span><p className="font-mono text-xs mt-0.5">{promoCode.stripe_coupon_id}</p></div>}
              </>
            )}
            <div><span className="text-gray-500">Redemptions</span><p className="font-medium mt-0.5">{promoCode.current_redemptions}{promoCode.max_redemptions ? ` / ${promoCode.max_redemptions}` : ' (unlimited)'}</p></div>
            <div><span className="text-gray-500">Expires</span><p className="font-medium mt-0.5">{formatDate(promoCode.expires_at)}</p></div>
            <div><span className="text-gray-500">Valid Plans</span><p className="font-medium mt-0.5">{promoCode.valid_plans?.join(', ') || 'All plans'}</p></div>
            <div><span className="text-gray-500">New Customers Only</span><p className="font-medium mt-0.5">{promoCode.new_customers_only ? 'Yes' : 'No'}</p></div>
            <div><span className="text-gray-500">One Per Customer</span><p className="font-medium mt-0.5">{promoCode.one_per_customer ? 'Yes' : 'No'}</p></div>
            <div><span className="text-gray-500">Created</span><p className="font-medium mt-0.5">{formatDate(promoCode.created_at)}</p></div>
            {promoCode.description && <div className="col-span-2"><span className="text-gray-500">Description</span><p className="font-medium mt-0.5">{promoCode.description}</p></div>}
          </div>
        </div>

        {/* Redemptions */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-700">Redemptions ({redemptions.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Team</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Applied To</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {redemptions.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-gray-400">No redemptions yet</td></tr>
              ) : redemptions.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.teams?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.users ? `${r.users.first_name} ${r.users.last_name}` : r.applied_by_admin_id ? 'Admin' : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.applied_to || 'Pending'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.plan || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'active' ? 'bg-green-100 text-green-700' : r.status === 'reversed' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(r.redeemed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Edit Promo Code</h2>
            {editError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">{editError}</div>}
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Redemptions</label>
                <input
                  type="number"
                  value={editMaxRedemptions}
                  onChange={e => setEditMaxRedemptions(e.target.value)}
                  placeholder="Unlimited"
                  min="1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expires At</label>
                <input
                  type="datetime-local"
                  value={editExpiresAt}
                  onChange={e => setEditExpiresAt(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={editLoading} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setShowEditModal(false)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
