'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

interface PendingInvitation {
  id: string
  email: string
  name: string
  role: string
  expires_at: string
  created_at: string
}

interface CurrentAdmin {
  id: string
  email: string
  name: string
  role: string
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  support_l1: 'Support L1',
  support_l2: 'Support L2',
}

function formatDateTime(d: string | null): string {
  if (!d) return 'Never'
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatRelative(d: string): string {
  const diff = new Date(d).getTime() - Date.now()
  if (diff < 0) return 'Expired'
  const hours = Math.floor(diff / (60 * 60 * 1000))
  if (hours < 1) {
    const mins = Math.floor(diff / 60000)
    return `${mins}m remaining`
  }
  return `${hours}h remaining`
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Invite modal
  const [showInvite, setShowInvite] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invName, setInvName] = useState('')
  const [invRole, setInvRole] = useState('support_l1')
  const [invLoading, setInvLoading] = useState(false)
  const [invError, setInvError] = useState('')
  const [invSuccess, setInvSuccess] = useState('')
  const [invSetupUrl, setInvSetupUrl] = useState('')

  // Deactivate modal
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState('')

  async function load() {
    try {
      const [authRes, listRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/admin-users/list'),
      ])

      if (!authRes.ok || !listRes.ok) {
        if (authRes.status === 401 || listRes.status === 401) {
          router.push('/login')
          return
        }
        if (listRes.status === 403) {
          router.push('/dashboard')
          return
        }
        throw new Error('Failed to load')
      }

      const authData = await authRes.json()
      const listData = await listRes.json()

      setCurrentAdmin(authData.admin)
      setAdmins(listData.admins)
      setInvitations(listData.pending_invitations)
    } catch {
      setError('Failed to load admin users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function closeInviteModal() {
    setShowInvite(false)
    setInvEmail('')
    setInvName('')
    setInvRole('support_l1')
    setInvError('')
    setInvSuccess('')
    setInvSetupUrl('')
  }

  async function handleInvite() {
    setInvError('')
    setInvSuccess('')
    setInvLoading(true)

    try {
      const res = await fetch('/api/admin-users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, name: invName, role: invRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        setInvError(data.error)
        return
      }
      setInvSuccess(`Invitation created for ${data.invitation.email}`)
      setInvSetupUrl(data.setup_url)
      // Refresh the list
      const listRes = await fetch('/api/admin-users/list')
      if (listRes.ok) {
        const listData = await listRes.json()
        setAdmins(listData.admins)
        setInvitations(listData.pending_invitations)
      }
    } catch {
      setInvError('Network error')
    } finally {
      setInvLoading(false)
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return
    setDeactivateError('')
    setDeactivating(true)

    try {
      const res = await fetch('/api/admin-users/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId: deactivateTarget.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeactivateError(data.error)
        return
      }
      // Update local state
      setAdmins((prev) =>
        prev.map((a) => (a.id === deactivateTarget.id ? { ...a, is_active: false } : a))
      )
      setDeactivateTarget(null)
    } catch {
      setDeactivateError('Network error')
    } finally {
      setDeactivating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (error && !currentAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{error}</p>
          <a href="/dashboard" className="text-blue-600 hover:underline text-sm">Back to dashboard</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <a href="/dashboard" className="text-lg font-semibold text-gray-900 hover:text-gray-700">SLIM Admin</a>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-medium text-gray-700">Admin Users</h1>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 flex gap-6 text-sm">
          <a href="/dashboard" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Dashboard</a>
          <a href="/customers" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Customers</a>
          <a href="/alerts" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Alerts</a>
          <a href="/errors" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Errors</a>
          <a href="/audit" className="py-2.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">Audit Log</a>
          <a href="/admin-users" className="py-2.5 border-b-2 border-gray-900 text-gray-900 font-medium">Admin Users</a>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Header with invite button */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">
            Admin Users ({admins.filter((a) => a.is_active).length} active)
          </h2>
          <button
            onClick={() => { closeInviteModal(); setShowInvite(true) }}
            className="px-4 py-2 text-sm rounded bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            Invite Admin User
          </button>
        </div>

        {/* Admin users table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="px-5 py-3 font-medium text-gray-600">Name</th>
                <th className="px-5 py-3 font-medium text-gray-600">Email</th>
                <th className="px-5 py-3 font-medium text-gray-600">Role</th>
                <th className="px-5 py-3 font-medium text-gray-600">Last Login</th>
                <th className="px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="px-5 py-3 font-medium text-gray-600 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-b border-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {a.name}
                    {a.id === currentAdmin?.id && (
                      <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{a.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      a.role === 'super_admin'
                        ? 'bg-purple-100 text-purple-700'
                        : a.role === 'support_l2'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {ROLE_LABELS[a.role] || a.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{formatDateTime(a.last_login_at)}</td>
                  <td className="px-5 py-3">
                    {a.is_active ? (
                      <span className="text-xs font-medium text-green-600">Active</span>
                    ) : (
                      <span className="text-xs font-medium text-gray-400">Inactive</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {a.is_active && a.role !== 'super_admin' && a.id !== currentAdmin?.id && (
                      <button
                        onClick={() => { setDeactivateError(''); setDeactivateTarget(a) }}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Pending Invitations ({invitations.length})
            </h3>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-5 py-2 font-medium text-gray-600">Name</th>
                    <th className="px-5 py-2 font-medium text-gray-600">Email</th>
                    <th className="px-5 py-2 font-medium text-gray-600">Role</th>
                    <th className="px-5 py-2 font-medium text-gray-600">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-50">
                      <td className="px-5 py-2.5 text-gray-700">{inv.name}</td>
                      <td className="px-5 py-2.5 text-gray-600">{inv.email}</td>
                      <td className="px-5 py-2.5">
                        <span className="text-xs font-medium bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                          {ROLE_LABELS[inv.role] || inv.role}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-gray-500 text-xs">
                        {formatRelative(inv.expires_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeInviteModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Admin User</h3>

            {invError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{invError}</div>
            )}

            {invSuccess ? (
              <div>
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded px-3 py-2 mb-3">
                  {invSuccess}
                </div>
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-1">Send this setup link to the invitee:</p>
                  <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs font-mono break-all select-all">
                    {invSetupUrl}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Expires in 24 hours.</p>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={closeInviteModal}
                    className="px-4 py-2 text-sm rounded bg-gray-900 text-white hover:bg-gray-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={invEmail}
                      onChange={(e) => setInvEmail(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="support@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      required
                      value={invName}
                      onChange={(e) => setInvName(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={invRole}
                      onChange={(e) => setInvRole(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="support_l1">Support L1 (Read-Only)</option>
                      <option value="support_l2">Support L2 (Action-Taker)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      L1 can view all data. L2 can also extend trials, comp months, and resolve errors.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={closeInviteModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                    Cancel
                  </button>
                  <button
                    onClick={handleInvite}
                    disabled={invLoading || !invEmail.trim() || !invName.trim()}
                    className="px-4 py-2 text-sm rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {invLoading ? 'Sending...' : 'Send Invitation'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivateTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDeactivateTarget(null)}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Deactivate Admin User</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to deactivate <strong>{deactivateTarget.name}</strong> ({deactivateTarget.email})?
              They will lose access immediately.
            </p>

            {deactivateError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{deactivateError}</div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeactivateTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deactivating ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
