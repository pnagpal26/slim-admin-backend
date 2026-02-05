'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface AccountInfo {
  id: string
  team_name: string
  plan_tier: string
  billing_exempt: boolean
  signup_date: string
  trial_ends_at: string | null
  last_login: string | null
  status: string
  leader: { id: string; name: string; email: string; phone: string | null } | null
  stripe: {
    subscription_status: string
    cancel_at_period_end: boolean
    current_period_end: string | null
  } | null
}

interface Usage {
  total: number
  available: number
  checked_out: number
  installed: number
  in_transit: number
  removed: number
  out_of_service: number
  plan_limit: number
  usage_percent: number
}

interface Member {
  id: string
  email: string
  name: string
  phone: string | null
  role: string
  is_active: boolean
  is_verified: boolean
  last_active_at: string | null
  created_at: string
}

interface Invitation {
  id: string
  email: string
  name: string
  role: string
  status: string
  created_at: string
  expires_at: string
}

interface ActivityEntry {
  id: string
  action: string
  performed_at: string
  action_method: string | null
  details: Record<string, unknown> | null
  lockbox_id: string | null
  user: { id: string; name: string; email: string } | null
}

const TIER_LABELS: Record<string, string> = {
  free_trial: 'Free Trial',
  solo: 'Solo Agent',
  small: 'Small Team',
  medium: 'Medium Team',
  enterprise: 'Enterprise',
}

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
  pending_cancellation: 'Pending Cancellation',
  cancelled: 'Cancelled',
}

const ROLE_LABELS: Record<string, string> = {
  solo_agent: 'Solo Agent',
  team_leader: 'Team Leader',
  team_admin: 'Team Admin',
  agent: 'Agent',
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatDateTime(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function usageColor(percent: number): string {
  if (percent > 90) return 'text-red-600'
  if (percent >= 70) return 'text-yellow-600'
  return 'text-green-600'
}

function usageBg(percent: number): string {
  if (percent > 90) return 'bg-red-500'
  if (percent >= 70) return 'bg-yellow-500'
  return 'bg-green-500'
}

export default function CustomerDetailPage() {
  const router = useRouter()
  const params = useParams()
  const teamId = params.id as string

  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Admin role for permission checks
  const [adminRole, setAdminRole] = useState<string | null>(null)

  // Modal state
  const [showExtendTrial, setShowExtendTrial] = useState(false)
  const [showCompMonth, setShowCompMonth] = useState(false)
  const [modalDays, setModalDays] = useState('7')
  const [modalReason, setModalReason] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')
  const [modalSuccess, setModalSuccess] = useState('')

  // Edit modal state
  const [showEdit, setShowEdit] = useState(false)
  const [editTeamName, setEditTeamName] = useState('')
  const [editLeaderName, setEditLeaderName] = useState('')
  const [editLeaderEmail, setEditLeaderEmail] = useState('')
  const [editLeaderPhone, setEditLeaderPhone] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [editSuccess, setEditSuccess] = useState('')

  // Delete modal state
  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/customers/detail?id=${teamId}`)
        if (!res.ok) {
          if (res.status === 401) { router.push('/login'); return }
          if (res.status === 404) { setError('Customer not found'); return }
          throw new Error('Failed to load')
        }
        const data = await res.json()
        setAccount(data.account)
        setUsage(data.usage)
        setMembers(data.members)
        setInvitations(data.invitations)
        setActivity(data.recent_activity)
      } catch {
        setError('Failed to load customer details')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [teamId, router])

  // Fetch admin role for permission checks
  useEffect(() => {
    async function fetchAdminRole() {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) {
          const data = await res.json()
          setAdminRole(data.admin?.role || null)
        }
      } catch {
        // Ignore errors - permission buttons just won't show
      }
    }
    fetchAdminRole()
  }, [])

  async function handleExtendTrial() {
    setModalError('')
    setModalSuccess('')
    setModalLoading(true)
    try {
      const res = await fetch('/api/customers/extend-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, days: modalDays, reason: modalReason }),
      })
      const data = await res.json()
      if (!res.ok) { setModalError(data.error); return }
      setModalSuccess(`Trial extended. New end date: ${formatDate(data.trial_ends_at)}`)
      setAccount((prev) => prev ? { ...prev, trial_ends_at: data.trial_ends_at } : prev)
    } catch {
      setModalError('Network error')
    } finally {
      setModalLoading(false)
    }
  }

  async function handleCompMonth() {
    setModalError('')
    setModalSuccess('')
    setModalLoading(true)
    try {
      const res = await fetch('/api/customers/comp-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, reason: modalReason }),
      })
      const data = await res.json()
      if (!res.ok) { setModalError(data.error); return }
      setModalSuccess(`Month comped. New period end: ${formatDate(data.new_period_end)}`)
    } catch {
      setModalError('Network error')
    } finally {
      setModalLoading(false)
    }
  }

  function closeModal() {
    setShowExtendTrial(false)
    setShowCompMonth(false)
    setModalDays('7')
    setModalReason('')
    setModalError('')
    setModalSuccess('')
  }

  function openEditModal() {
    if (account) {
      setEditTeamName(account.team_name)
      setEditLeaderName(account.leader?.name || '')
      setEditLeaderEmail(account.leader?.email || '')
      setEditLeaderPhone(account.leader?.phone || '')
    }
    setEditReason('')
    setEditError('')
    setEditSuccess('')
    setShowEdit(true)
  }

  function closeEditModal() {
    setShowEdit(false)
    setEditTeamName('')
    setEditLeaderName('')
    setEditLeaderEmail('')
    setEditLeaderPhone('')
    setEditReason('')
    setEditError('')
    setEditSuccess('')
  }

  async function handleEdit() {
    setEditError('')
    setEditSuccess('')
    setEditLoading(true)
    try {
      const res = await fetch('/api/customers/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          teamName: editTeamName,
          leaderName: editLeaderName,
          leaderEmail: editLeaderEmail,
          leaderPhone: editLeaderPhone || null,
          reason: editReason,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error); return }
      setEditSuccess('Customer updated successfully')
      // Update local state
      setAccount((prev) => prev ? {
        ...prev,
        team_name: data.team_name,
        leader: data.leader,
      } : prev)
    } catch {
      setEditError('Network error')
    } finally {
      setEditLoading(false)
    }
  }

  function openDeleteModal() {
    setDeleteConfirmName('')
    setDeleteReason('')
    setDeleteError('')
    setShowDelete(true)
  }

  function closeDeleteModal() {
    setShowDelete(false)
    setDeleteConfirmName('')
    setDeleteReason('')
    setDeleteError('')
  }

  async function handleDelete() {
    setDeleteError('')
    setDeleteLoading(true)
    try {
      const res = await fetch('/api/customers/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          confirmName: deleteConfirmName,
          reason: deleteReason,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setDeleteError(data.error); return }
      // Hard redirect to customers list to avoid stale cache
      window.location.href = '/customers?deleted=1'
    } catch {
      setDeleteError('Network error')
    } finally {
      setDeleteLoading(false)
    }
  }

  const canEdit = adminRole === 'super_admin' || adminRole === 'support_l2'
  const canDelete = adminRole === 'super_admin'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{error}</p>
          <a href="/customers" className="text-blue-600 hover:underline text-sm">Back to customers</a>
        </div>
      </div>
    )
  }

  if (!account || !usage) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <a href="/dashboard" className="hover:text-gray-700">SLIM Admin</a>
            <span>/</span>
            <a href="/customers" className="hover:text-gray-700">Customers</a>
            <span>/</span>
            <span className="text-gray-900">{account.team_name}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{account.team_name}</h1>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[account.status] || ''}`}>
                {STATUS_LABELS[account.status] || account.status}
              </span>
            </div>
            <div className="flex gap-2">
              {account.status === 'active_trial' && (
                <button
                  onClick={() => { closeModal(); setShowExtendTrial(true) }}
                  className="px-3 py-1.5 text-sm rounded border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  Extend Trial
                </button>
              )}
              {account.status === 'active_paid' && (
                <button
                  onClick={() => { closeModal(); setShowCompMonth(true) }}
                  className="px-3 py-1.5 text-sm rounded border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors"
                >
                  Comp 1 Month
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Section A: Account Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Account Info</h2>
            {canEdit && (
              <button
                onClick={openEditModal}
                className="px-3 py-1 text-xs rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Plan</p>
              <p className="font-medium">
                {TIER_LABELS[account.plan_tier] || account.plan_tier}
                {account.billing_exempt && <span className="ml-1 text-xs text-purple-600">(exempt)</span>}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Signup Date</p>
              <p className="font-medium">{formatDate(account.signup_date)}</p>
            </div>
            <div>
              <p className="text-gray-500">Last Active</p>
              <p className="font-medium">{formatDateTime(account.last_login)}</p>
            </div>
            {account.trial_ends_at && account.status === 'active_trial' && (
              <div>
                <p className="text-gray-500">Trial Ends</p>
                <p className="font-medium">{formatDate(account.trial_ends_at)}</p>
              </div>
            )}
            {account.stripe?.cancel_at_period_end && account.stripe.current_period_end && (
              <div>
                <p className="text-gray-500">Cancellation Date</p>
                <p className="font-medium text-yellow-700">{formatDate(account.stripe.current_period_end)}</p>
              </div>
            )}
          </div>
          {account.leader && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                {account.plan_tier === 'solo' ? 'Account Owner' : 'Team Leader'}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Name</p>
                  <p className="font-medium">{account.leader.name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Email</p>
                  <p className="font-medium">{account.leader.email}</p>
                </div>
                {account.leader.phone && (
                  <div>
                    <p className="text-gray-500">Phone</p>
                    <p className="font-medium">{account.leader.phone}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section B: Usage Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Usage Summary</h2>
          <div className="flex items-center gap-6 mb-4">
            <div>
              <p className="text-2xl font-semibold">{usage.total}</p>
              <p className="text-sm text-gray-500">Total Lockboxes</p>
            </div>
            <div>
              <p className={`text-2xl font-semibold ${usageColor(usage.usage_percent)}`}>
                {usage.installed} / {usage.plan_limit}
              </p>
              <p className="text-sm text-gray-500">Active Installations ({usage.usage_percent}%)</p>
            </div>
          </div>
          {/* Usage bar */}
          <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
            <div
              className={`h-2 rounded-full transition-all ${usageBg(usage.usage_percent)}`}
              style={{ width: `${Math.min(usage.usage_percent, 100)}%` }}
            />
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
            {[
              { label: 'Available', count: usage.available },
              { label: 'Checked Out', count: usage.checked_out },
              { label: 'Installed', count: usage.installed },
              { label: 'In Transit', count: usage.in_transit },
              { label: 'Removed', count: usage.removed },
              { label: 'Out of Service', count: usage.out_of_service },
            ].map((s) => (
              <div key={s.label} className="text-center py-2 bg-gray-50 rounded">
                <p className="text-lg font-medium">{s.count}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Section C: Team Members */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Team Members ({members.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-5 py-2 font-medium text-gray-600">Name</th>
                <th className="px-5 py-2 font-medium text-gray-600">Email</th>
                <th className="px-5 py-2 font-medium text-gray-600">Role</th>
                <th className="px-5 py-2 font-medium text-gray-600">Last Login</th>
                <th className="px-5 py-2 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-gray-50">
                  <td className="px-5 py-2.5 font-medium">{m.name}</td>
                  <td className="px-5 py-2.5 text-gray-600">{m.email}</td>
                  <td className="px-5 py-2.5 text-gray-600">{ROLE_LABELS[m.role] || m.role}</td>
                  <td className="px-5 py-2.5 text-gray-600">{formatDateTime(m.last_active_at)}</td>
                  <td className="px-5 py-2.5">
                    {m.is_active ? (
                      <span className="text-green-600 text-xs font-medium">Active</span>
                    ) : (
                      <span className="text-gray-400 text-xs font-medium">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
              {invitations.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 bg-yellow-50/50">
                  <td className="px-5 py-2.5 font-medium text-gray-500">{inv.name}</td>
                  <td className="px-5 py-2.5 text-gray-500">{inv.email}</td>
                  <td className="px-5 py-2.5 text-gray-500">{ROLE_LABELS[inv.role] || inv.role}</td>
                  <td className="px-5 py-2.5 text-gray-400">—</td>
                  <td className="px-5 py-2.5">
                    <span className="text-yellow-600 text-xs font-medium bg-yellow-100 px-1.5 py-0.5 rounded">
                      Pending
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section D: Recent Activity */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Recent Activity
            </h2>
            {activity.length > 0 && (
              <span className="text-xs text-gray-400">Last 20 entries</span>
            )}
          </div>
          {activity.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">No activity recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-2 font-medium text-gray-600">Timestamp</th>
                  <th className="px-5 py-2 font-medium text-gray-600">User</th>
                  <th className="px-5 py-2 font-medium text-gray-600">Action</th>
                  <th className="px-5 py-2 font-medium text-gray-600">Details</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50">
                    <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                      {formatDateTime(a.performed_at)}
                    </td>
                    <td className="px-5 py-2.5 text-gray-600">
                      {a.user?.name || '—'}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">
                        {a.action}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-gray-500 text-xs max-w-xs truncate">
                      {a.details ? JSON.stringify(a.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Delete Customer Section - Super Admin only */}
        {canDelete && (
          <div className="bg-white rounded-lg border border-red-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide">Danger Zone</h2>
                <p className="text-sm text-gray-500 mt-1">Permanently delete this customer and all associated data.</p>
              </div>
              <button
                onClick={openDeleteModal}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Delete Customer
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Extend Trial Modal */}
      {showExtendTrial && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Extend Trial</h3>
            <p className="text-sm text-gray-500 mb-4">
              Extend the free trial for <strong>{account.team_name}</strong>.
              Current trial ends: {formatDate(account.trial_ends_at)}.
            </p>
            {modalError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{modalError}</div>
            )}
            {modalSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded px-3 py-2 mb-3">{modalSuccess}</div>
            )}
            {!modalSuccess && (
              <>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Days to add</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={modalDays}
                    onChange={(e) => setModalDays(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
                  <textarea
                    value={modalReason}
                    onChange={(e) => setModalReason(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Why is this trial being extended?"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                    Cancel
                  </button>
                  <button
                    onClick={handleExtendTrial}
                    disabled={modalLoading || !modalReason.trim()}
                    className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {modalLoading ? 'Extending...' : 'Extend Trial'}
                  </button>
                </div>
              </>
            )}
            {modalSuccess && (
              <div className="flex justify-end">
                <button onClick={closeModal} className="px-4 py-2 text-sm rounded bg-gray-900 text-white hover:bg-gray-800">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comp 1 Month Modal */}
      {showCompMonth && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Comp 1 Month</h3>
            <p className="text-sm text-gray-500 mb-4">
              Grant 30 free days to <strong>{account.team_name}</strong>.
              This extends their current billing period.
            </p>
            {modalError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{modalError}</div>
            )}
            {modalSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded px-3 py-2 mb-3">{modalSuccess}</div>
            )}
            {!modalSuccess && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
                  <textarea
                    value={modalReason}
                    onChange={(e) => setModalReason(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Why is this month being comped?"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                    Cancel
                  </button>
                  <button
                    onClick={handleCompMonth}
                    disabled={modalLoading || !modalReason.trim()}
                    className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {modalLoading ? 'Processing...' : 'Comp 1 Month'}
                  </button>
                </div>
              </>
            )}
            {modalSuccess && (
              <div className="flex justify-end">
                <button onClick={closeModal} className="px-4 py-2 text-sm rounded bg-gray-900 text-white hover:bg-gray-800">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeEditModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Customer</h3>
            {editError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{editError}</div>
            )}
            {editSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded px-3 py-2 mb-3">{editSuccess}</div>
            )}
            {!editSuccess && (
              <>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
                    <input
                      type="text"
                      value={editTeamName}
                      onChange={(e) => setEditTeamName(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leader Name</label>
                    <input
                      type="text"
                      value={editLeaderName}
                      onChange={(e) => setEditLeaderName(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leader Email</label>
                    <input
                      type="email"
                      value={editLeaderEmail}
                      onChange={(e) => setEditLeaderEmail(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Leader Phone (optional)</label>
                    <input
                      type="tel"
                      value={editLeaderPhone}
                      onChange={(e) => setEditLeaderPhone(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
                    <textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      rows={2}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Why is this customer being edited?"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={closeEditModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                    Cancel
                  </button>
                  <button
                    onClick={handleEdit}
                    disabled={editLoading || !editTeamName.trim() || !editLeaderName.trim() || !editLeaderEmail.trim() || !editReason.trim()}
                    className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </>
            )}
            {editSuccess && (
              <div className="flex justify-end">
                <button onClick={closeEditModal} className="px-4 py-2 text-sm rounded bg-gray-900 text-white hover:bg-gray-800">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Customer Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeDeleteModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-red-600 mb-4">Delete Customer</h3>
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
              <p className="text-sm text-red-700 font-medium">Warning: This action is permanent!</p>
              <p className="text-sm text-red-600 mt-1">
                This will permanently delete <strong>{account.team_name}</strong> and all associated data including:
              </p>
              <ul className="text-sm text-red-600 mt-2 list-disc list-inside">
                <li>All team members</li>
                <li>All lockboxes and audit logs</li>
                <li>All invitations</li>
                <li>Stripe customer data</li>
              </ul>
            </div>
            {deleteError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{deleteError}</div>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type &quot;{account.team_name}&quot; to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Enter team name exactly"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Why is this customer being deleted?"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeDeleteModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading || deleteConfirmName !== account.team_name || deleteReason.trim().length < 3}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
