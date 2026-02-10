'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface AdminUser {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string | null
  role: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

interface PendingInvitation {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string | null
  role: string
  expires_at: string
  created_at: string
}

interface CurrentAdmin {
  id: string
  email: string
  first_name: string
  last_name: string
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
  const [invFirstName, setInvFirstName] = useState('')
  const [invLastName, setInvLastName] = useState('')
  const [invPhone, setInvPhone] = useState('')
  const [invRole, setInvRole] = useState('support_l1')
  const [invLoading, setInvLoading] = useState(false)
  const [invError, setInvError] = useState('')
  const [invSuccess, setInvSuccess] = useState('')
  const [invSetupUrl, setInvSetupUrl] = useState('')

  // Kebab menu
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Edit modal
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  // Change role modal
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null)
  const [newRole, setNewRole] = useState('')
  const [roleLoading, setRoleLoading] = useState(false)
  const [roleError, setRoleError] = useState('')

  // Deactivate modal
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUser | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState('')

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  async function load() {
    try {
      const [authRes, listRes] = await Promise.all([
        fetch('/api/auth/me', { cache: 'no-store' }),
        fetch('/api/admin-users/list', { cache: 'no-store' }),
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

  async function refreshList() {
    const res = await fetch('/api/admin-users/list', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setAdmins(data.admins)
      setInvitations(data.pending_invitations)
    }
  }

  function closeInviteModal() {
    setShowInvite(false)
    setInvEmail('')
    setInvFirstName('')
    setInvLastName('')
    setInvPhone('')
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
        body: JSON.stringify({ email: invEmail, firstName: invFirstName, lastName: invLastName, phone: invPhone, role: invRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        setInvError(data.error)
        return
      }
      if (data.email_sent) {
        setInvSuccess(`Invitation email sent to ${data.invitation.email}`)
        setInvSetupUrl('')
      } else {
        setInvSuccess(`Invitation created for ${data.invitation.email}, but email delivery failed.`)
        setInvSetupUrl(data.setup_url || '')
      }
      await refreshList()
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

  async function handleReactivate(target: AdminUser) {
    try {
      const res = await fetch('/api/admin-users/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId: target.id }),
      })
      if (res.ok) {
        setAdmins((prev) =>
          prev.map((a) => (a.id === target.id ? { ...a, is_active: true } : a))
        )
      }
    } catch { /* ignore */ }
    setMenuOpen(null)
  }

  function openEditModal(target: AdminUser) {
    setEditTarget(target)
    setEditFirstName(target.first_name)
    setEditLastName(target.last_name)
    setEditPhone(target.phone || '')
    setEditError('')
    setMenuOpen(null)
  }

  async function handleEdit() {
    if (!editTarget) return
    setEditError('')
    setEditLoading(true)

    try {
      const res = await fetch('/api/admin-users/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUserId: editTarget.id,
          firstName: editFirstName,
          lastName: editLastName,
          phone: editPhone,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditError(data.error)
        return
      }
      setAdmins((prev) =>
        prev.map((a) =>
          a.id === editTarget.id
            ? { ...a, first_name: editFirstName.trim(), last_name: editLastName.trim(), phone: editPhone.trim() || null }
            : a
        )
      )
      setEditTarget(null)
    } catch {
      setEditError('Network error')
    } finally {
      setEditLoading(false)
    }
  }

  function openChangeRoleModal(target: AdminUser) {
    setRoleTarget(target)
    setNewRole(target.role === 'support_l1' ? 'support_l2' : 'support_l1')
    setRoleError('')
    setMenuOpen(null)
  }

  async function handleChangeRole() {
    if (!roleTarget) return
    setRoleError('')
    setRoleLoading(true)

    try {
      const res = await fetch('/api/admin-users/change-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId: roleTarget.id, newRole }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRoleError(data.error)
        return
      }
      setAdmins((prev) =>
        prev.map((a) => (a.id === roleTarget.id ? { ...a, role: newRole } : a))
      )
      setRoleTarget(null)
    } catch {
      setRoleError('Network error')
    } finally {
      setRoleLoading(false)
    }
  }

  function openDeleteModal(target: AdminUser) {
    setDeleteTarget(target)
    setDeleteReason('')
    setDeleteError('')
    setMenuOpen(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteError('')
    setDeleteLoading(true)

    try {
      const res = await fetch('/api/admin-users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUserId: deleteTarget.id, reason: deleteReason }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeleteError(data.error)
        return
      }
      setAdmins((prev) => prev.filter((a) => a.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch {
      setDeleteError('Network error')
    } finally {
      setDeleteLoading(false)
    }
  }

  const activeCount = admins.filter((a) => a.is_active).length
  const inactiveCount = admins.filter((a) => !a.is_active).length

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
      <header className="bg-[#0D7377]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-lg font-semibold text-white hover:text-white/90">SLIM Admin</a>
            <span className="text-white/40">/</span>
            <h1 className="text-lg font-medium text-white/90">Admin Users</h1>
          </div>
          {currentAdmin && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/80">
                {[currentAdmin.first_name, currentAdmin.last_name].filter(Boolean).join(' ')} <span className="text-white/60">({ROLE_LABELS[currentAdmin.role] || currentAdmin.role})</span>
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
          <a href="/admin-users" className="py-2.5 border-b-2 border-[#0D7377] text-[#0D7377] font-medium">Admin Users</a>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Header with invite button */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">
            Admin Users
            <span className="text-sm font-normal text-gray-500 ml-2">
              {activeCount} active{inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''}
            </span>
          </h2>
          <button
            onClick={() => { closeInviteModal(); setShowInvite(true) }}
            className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163] transition-colors"
          >
            Invite Admin User
          </button>
        </div>

        {/* Admin users table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6" ref={menuRef}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th className="px-5 py-3 font-medium text-gray-600">Name</th>
                <th className="px-5 py-3 font-medium text-gray-600">Email</th>
                <th className="px-5 py-3 font-medium text-gray-600">Phone</th>
                <th className="px-5 py-3 font-medium text-gray-600">Role</th>
                <th className="px-5 py-3 font-medium text-gray-600">Last Login</th>
                <th className="px-5 py-3 font-medium text-gray-600">Status</th>
                <th className="px-5 py-3 font-medium text-gray-600 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSelf = a.id === currentAdmin?.id
                const canManage = !isSelf && a.role !== 'super_admin'

                return (
                  <tr key={a.id} className={`border-b border-gray-50 ${!a.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {[a.first_name, a.last_name].filter(Boolean).join(' ')}
                      {isSelf && (
                        <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{a.email}</td>
                    <td className="px-5 py-3 text-gray-600">{a.phone || '—'}</td>
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
                    <td className="px-5 py-3 text-right relative">
                      {canManage && (
                        <>
                          <button
                            onClick={() => setMenuOpen(menuOpen === a.id ? null : a.id)}
                            className="text-gray-400 hover:text-gray-600 px-1"
                            title="Actions"
                          >
                            &#8942;
                          </button>
                          {menuOpen === a.id && (
                            <div className="absolute right-4 top-10 z-20 bg-white border border-gray-200 rounded shadow-lg py-1 w-40">
                              <button
                                onClick={() => openEditModal(a)}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                              >
                                Edit Details
                              </button>
                              <button
                                onClick={() => openChangeRoleModal(a)}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                              >
                                Change Role
                              </button>
                              {a.is_active ? (
                                <button
                                  onClick={() => { setDeactivateError(''); setDeactivateTarget(a); setMenuOpen(null) }}
                                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-yellow-700"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleReactivate(a)}
                                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-green-700"
                                >
                                  Reactivate
                                </button>
                              )}
                              {!a.is_active && (
                                <button
                                  onClick={() => openDeleteModal(a)}
                                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-red-600"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
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
                    <th className="px-5 py-2 font-medium text-gray-600">Phone</th>
                    <th className="px-5 py-2 font-medium text-gray-600">Role</th>
                    <th className="px-5 py-2 font-medium text-gray-600">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-50">
                      <td className="px-5 py-2.5 text-gray-700">{[inv.first_name, inv.last_name].filter(Boolean).join(' ')}</td>
                      <td className="px-5 py-2.5 text-gray-600">{inv.email}</td>
                      <td className="px-5 py-2.5 text-gray-600">{inv.phone || '—'}</td>
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
                {invSetupUrl && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-1">Share this setup link manually:</p>
                    <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 text-xs font-mono break-all select-all">
                      {invSetupUrl}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Expires in 24 hours.</p>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={closeInviteModal}
                    className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163]"
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
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
                      placeholder="support@example.com"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                      <input
                        type="text"
                        required
                        value={invFirstName}
                        onChange={(e) => setInvFirstName(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
                        placeholder="Jane"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={invLastName}
                        onChange={(e) => setInvLastName(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
                        placeholder="Smith"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={invPhone}
                      onChange={(e) => setInvPhone(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
                      placeholder="+1 555-123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={invRole}
                      onChange={(e) => setInvRole(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
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
                    disabled={invLoading || !invEmail.trim() || !invFirstName.trim() || !invPhone.trim()}
                    className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {invLoading ? 'Sending...' : 'Send Invitation'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Admin Details</h3>
            <p className="text-sm text-gray-500 mb-3">{editTarget.email}</p>

            {editError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{editError}</div>
            )}

            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={editLoading || !editFirstName.trim()}
                className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {roleTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setRoleTarget(null)}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Change Role</h3>
            <p className="text-sm text-gray-600 mb-4">
              Change role for <strong>{[roleTarget.first_name, roleTarget.last_name].filter(Boolean).join(' ')}</strong>
            </p>

            {roleError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{roleError}</div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">New Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7377]"
              >
                <option value="support_l1">Support L1 (Read-Only)</option>
                <option value="support_l2">Support L2 (Action-Taker)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Current role: {ROLE_LABELS[roleTarget.role]}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setRoleTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleChangeRole}
                disabled={roleLoading || newRole === roleTarget.role}
                className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {roleLoading ? 'Changing...' : 'Change Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivateTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDeactivateTarget(null)}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Deactivate Admin User</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to deactivate <strong>{[deactivateTarget.first_name, deactivateTarget.last_name].filter(Boolean).join(' ')}</strong> ({deactivateTarget.email})?
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-red-600 mb-2">Delete Admin User</h3>
            <p className="text-sm text-gray-600 mb-4">
              Permanently delete <strong>{[deleteTarget.first_name, deleteTarget.last_name].filter(Boolean).join(' ')}</strong> ({deleteTarget.email})?
              This action cannot be undone.
            </p>

            {deleteError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{deleteError}</div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={2}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Why is this account being deleted?"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading || deleteReason.trim().length < 3}
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
