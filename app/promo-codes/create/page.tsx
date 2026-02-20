'use client'

import { useState } from 'react'

const PLANS = ['solo', 'solo_pro', 'solo_max', 'team_starter', 'team_growth', 'team_pro']

export default function CreatePromoCodePage() {
  const [type, setType] = useState<'extended_trial' | 'subscription_discount'>('extended_trial')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [freeDays, setFreeDays] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [durationMonths, setDurationMonths] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [validPlans, setValidPlans] = useState<string[]>([])
  const [newCustomersOnly, setNewCustomersOnly] = useState(false)
  const [onePerCustomer, setOnePerCustomer] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePlanToggle = (plan: string) => {
    setValidPlans(prev => prev.includes(plan) ? prev.filter(p => p !== plan) : [...prev, plan])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/promo-codes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.toUpperCase().trim(),
        description: description.trim() || undefined,
        type,
        free_days: type === 'extended_trial' ? parseInt(freeDays) : undefined,
        discount_percent: type === 'subscription_discount' ? parseInt(discountPercent) : undefined,
        duration_months: type === 'subscription_discount' ? parseInt(durationMonths) : undefined,
        max_redemptions: maxRedemptions ? parseInt(maxRedemptions) : undefined,
        expires_at: expiresAt || undefined,
        valid_plans: validPlans.length ? validPlans : undefined,
        new_customers_only: newCustomersOnly,
        one_per_customer: onePerCustomer,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to create promo code')
      setLoading(false)
      return
    }

    window.location.href = `/promo-codes/${data.promo_code.id}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0D7377]">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-white/70 mb-1">
            <a href="/dashboard" className="hover:text-white">SLIM Admin</a>
            <span>/</span>
            <a href="/promo-codes" className="hover:text-white">Promo Codes</a>
            <span>/</span>
            <span className="text-white">Create</span>
          </div>
          <h1 className="text-xl font-semibold text-white">Create Promo Code</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm text-red-700">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME30"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase"
              />
              <p className="text-xs text-gray-500 mt-1">Uppercase letters, numbers, hyphens, underscores only</p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Welcome discount for new agents"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setType('extended_trial')}
                  className={`px-4 py-2 rounded-lg text-sm border ${type === 'extended_trial' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700'}`}
                >
                  Extended Trial
                </button>
                <button
                  type="button"
                  onClick={() => setType('subscription_discount')}
                  className={`px-4 py-2 rounded-lg text-sm border ${type === 'subscription_discount' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700'}`}
                >
                  Subscription Discount
                </button>
              </div>
            </div>

            {/* Type-specific fields */}
            {type === 'extended_trial' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Free Days *</label>
                <input
                  type="number"
                  value={freeDays}
                  onChange={e => setFreeDays(e.target.value)}
                  min="1" max="365"
                  required
                  className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Percent *</label>
                  <input
                    type="number"
                    value={discountPercent}
                    onChange={e => setDiscountPercent(e.target.value)}
                    min="1" max="100"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (months) *</label>
                  <input
                    type="number"
                    value={durationMonths}
                    onChange={e => setDurationMonths(e.target.value)}
                    min="1"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Restrictions */}
            <div className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Restrictions</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Max Redemptions</label>
                  <input
                    type="number"
                    value={maxRedemptions}
                    onChange={e => setMaxRedemptions(e.target.value)}
                    placeholder="Unlimited"
                    min="1"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Expires At</label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={e => setExpiresAt(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm text-gray-600 mb-2">Valid Plans (leave empty for all)</label>
                <div className="flex flex-wrap gap-2">
                  {PLANS.map(plan => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => handlePlanToggle(plan)}
                      className={`px-3 py-1 rounded-full text-xs border ${validPlans.includes(plan) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}
                    >
                      {plan}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newCustomersOnly} onChange={e => setNewCustomersOnly(e.target.checked)} className="rounded" />
                  <span className="text-sm text-gray-600">New customers only</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={onePerCustomer} onChange={e => setOnePerCustomer(e.target.checked)} className="rounded" />
                  <span className="text-sm text-gray-600">One per customer</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Promo Code'}
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/promo-codes' }}
                className="border border-gray-300 text-gray-700 px-6 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
