'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { TIER_LABELS, STATUS_COLORS, STATUS_LABELS } from '@/lib/constants'

interface AccountInfo {
  id: string
  team_name: string
  plan_tier: string
  billing_exempt: boolean
  signup_date: string
  trial_ends_at: string | null
  last_login: string | null
  status: string
  account_status: string
  suspended_at: string | null
  suspended_reason: string | null
  suspended_by_admin_id: string | null
  re_enabled_at: string | null
  re_enabled_by: string | null
  leader: { id: string; first_name: string; last_name: string; name: string; email: string; phone: string | null } | null
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
  first_name: string
  last_name: string
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
  first_name: string
  last_name: string
  role: string
  status: string
  created_at: string
  expires_at: string
}

interface AssignedUser {
  id: string
  first_name: string
  last_name: string
  email: string
}

interface Lockbox {
  id: string
  lockbox_id: string
  status: string
  current_address: string | null
  make_model: string | null
  description: string | null
  closing_date: string | null
  installed_at: string | null
  removed_at: string | null
  updated_at: string
  created_at: string
  assigned_to: AssignedUser | null
}

interface LockboxSummary {
  total: number
  by_status: Record<string, number>
}

interface SentEmail {
  id: string
  template_key: string
  recipient: string
  subject: string
  sent_at: string
  status: string
  resend_id: string | null
}

interface EmailSummary {
  total: number
  by_status: Record<string, number>
  bounce_rate: number
}

interface TimelineEvent {
  id: string
  type: 'lockbox_action' | 'email_sent' | 'admin_action'
  timestamp: string
  title: string
  subtitle: string | null
  actor: { name: string; email: string; role: 'customer' | 'admin' } | null
  badge: string | null
  metadata: Record<string, unknown>
}

interface CustomerDispute {
  id: string
  stripe_dispute_id: string
  stripe_charge_id: string
  amount: number
  currency: string
  reason: string
  status: string
  evidence_due_by: string | null
  hours_remaining: number | null
  urgency: 'critical' | 'urgent' | 'warning' | 'normal'
  resolved_at: string | null
  created_at: string
}

interface CustomerRefund {
  id: string
  stripe_refund_id: string
  stripe_charge_id: string
  amount_refunded: number
  currency: string
  reason: string | null
  status: string
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  solo_agent: 'Solo Agent',
  team_leader: 'Team Leader',
  team_admin: 'Team Admin',
  agent: 'Agent',
}

const LOCKBOX_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  installed:     { bg: 'bg-teal-100',   text: 'text-teal-700',   label: 'Installed' },
  checked_out:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Checked Out' },
  in_transit:    { bg: 'bg-orange-100', text: 'text-orange-700', label: 'In Transit' },
  available:     { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Available' },
  removed:       { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Removed' },
  out_of_service:{ bg: 'bg-red-100',    text: 'text-red-700',    label: 'Out of Service' },
}

const EMAIL_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  delivered: { bg: 'bg-green-100', text: 'text-green-700' },
  opened:    { bg: 'bg-blue-100',  text: 'text-blue-700' },
  clicked:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  bounced:   { bg: 'bg-red-100',   text: 'text-red-700' },
  sent:      { bg: 'bg-gray-100',  text: 'text-gray-600' },
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

function getTemplateBadgeStyle(templateKey: string): { bg: string; text: string; label: string } {
  if (['password_reset', 'email_verification_resend', 'admin_invitation', 'team_invite'].includes(templateKey)) {
    return { bg: 'bg-red-100', text: 'text-red-700', label: 'Security' }
  }
  if (['payment_failed', 'trial_expiring', 'trial_expired', 'payment_first', 'payment_recurring'].includes(templateKey)) {
    return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Billing' }
  }
  if (['team_member_joined', 'team_member_removed_member', 'team_member_removed_leader'].includes(templateKey)) {
    return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Team' }
  }
  return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Other' }
}

function formatTemplateLabel(templateKey: string): string {
  const labels: Record<string, string> = {
    'team_invite': 'Team Invitation',
    'password_reset': 'Password Reset',
    'email_verification_resend': 'Email Verification',
    'admin_invitation': 'Admin Invitation',
    'payment_failed': 'Payment Failed',
    'trial_expiring': 'Trial Expiring',
    'trial_expired': 'Trial Expired',
    'team_member_joined': 'Member Joined',
    'team_member_removed_member': 'Member Removed',
    'team_member_removed_leader': 'Member Removed',
    'payment_first': 'Payment Receipt',
    'payment_recurring': 'Payment Receipt',
  }
  return labels[templateKey] || templateKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}


const DISPUTE_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  needs_response:         { label: 'Needs Response', bg: 'bg-red-100',    text: 'text-red-700' },
  warning_needs_response: { label: 'Needs Response', bg: 'bg-red-100',    text: 'text-red-700' },
  under_review:           { label: 'Under Review',   bg: 'bg-yellow-100', text: 'text-yellow-700' },
  warning_under_review:   { label: 'Under Review',   bg: 'bg-yellow-100', text: 'text-yellow-700' },
  warning_closed:         { label: 'Closed',         bg: 'bg-gray-100',   text: 'text-gray-600' },
  prevented:              { label: 'Prevented',      bg: 'bg-blue-100',   text: 'text-blue-700' },
  won:                    { label: 'Won',            bg: 'bg-green-100',  text: 'text-green-700' },
  lost:                   { label: 'Lost',           bg: 'bg-gray-100',   text: 'text-gray-600' },
}

const DISPUTE_URGENCY_ROW: Record<string, string> = {
  critical: 'bg-red-50',
  urgent:   'bg-orange-50',
  warning:  'bg-yellow-50/50',
  normal:   '',
}

const DISPUTE_REASON_LABELS: Record<string, string> = {
  bank_cannot_process:        'Bank Cannot Process',
  check_returned:             'Check Returned',
  credit_not_processed:       'Credit Not Processed',
  customer_initiated:         'Customer Initiated',
  debit_not_authorized:       'Debit Not Authorized',
  duplicate:                  'Duplicate',
  fraudulent:                 'Fraudulent',
  general:                    'General',
  incorrect_account_details:  'Incorrect Account',
  insufficient_funds:         'Insufficient Funds',
  product_not_received:       'Product Not Received',
  product_unacceptable:       'Product Unacceptable',
  subscription_canceled:      'Subscription Canceled',
  unrecognized:               'Unrecognized',
}

const REFUND_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  succeeded: { label: 'Succeeded', bg: 'bg-green-100',  text: 'text-green-700' },
  pending:   { label: 'Pending',   bg: 'bg-yellow-100', text: 'text-yellow-700' },
  failed:    { label: 'Failed',    bg: 'bg-red-100',    text: 'text-red-700' },
  canceled:  { label: 'Canceled',  bg: 'bg-gray-100',   text: 'text-gray-600' },
}

const REFUND_REASON_LABELS: Record<string, string> = {
  duplicate:                  'Duplicate',
  fraudulent:                 'Fraudulent',
  requested_by_customer:      'Customer Request',
  expired_uncaptured_charge:  'Uncaptured Charge',
  unknown:                    'Unknown',
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDeadline(hoursRemaining: number | null, evidenceDueBy: string | null): string {
  if (!evidenceDueBy) return '—'
  const date = new Date(evidenceDueBy).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (hoursRemaining === null || hoursRemaining < 0) return `${date} (past)`
  if (hoursRemaining < 24) return `${date} (${hoursRemaining}h left)`
  return `${date} (${Math.floor(hoursRemaining / 24)}d left)`
}

export default function CustomerDetailPage() {
  const router = useRouter()
  const params = useParams()
  const teamId = params.id as string

  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [lockboxes, setLockboxes] = useState<Lockbox[]>([])
  const [lockboxSummary, setLockboxSummary] = useState<LockboxSummary | null>(null)
  const [lockboxStatusFilter, setLockboxStatusFilter] = useState<string>('all')
  const [emailHistory, setEmailHistory] = useState<SentEmail[]>([])
  const [emailSummary, setEmailSummary] = useState<EmailSummary | null>(null)
  const [emailStatusFilter, setEmailStatusFilter] = useState<string>('all')
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [timelineHasMore, setTimelineHasMore] = useState(false)
  const [timelineLoadingMore, setTimelineLoadingMore] = useState(false)
  const [timelinePage, setTimelinePage] = useState(0)
  const [timelineTotal, setTimelineTotal] = useState(0)
  const [timelineDateRange, setTimelineDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')
  const [timelineTypeFilter, setTimelineTypeFilter] = useState<'all' | 'lockbox_action' | 'email_sent' | 'admin_action'>('all')
  const [disputes, setDisputes] = useState<CustomerDispute[]>([])
  const [disputesSummary, setDisputesSummary] = useState<{ total: number; action_needed: number } | null>(null)
  const [refunds, setRefunds] = useState<CustomerRefund[]>([])
  const [refundsSummary, setRefundsSummary] = useState<{ total: number; total_amount_succeeded: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Admin info for permission checks + header
  const [adminRole, setAdminRole] = useState<string | null>(null)
  const [adminInfo, setAdminInfo] = useState<{ first_name: string; last_name: string; role: string } | null>(null)

  // Modal state — extend trial / comp month
  const [showExtendTrial, setShowExtendTrial] = useState(false)
  const [showApplyPromo, setShowApplyPromo] = useState(false)
  const [showApplyCredit, setShowApplyCredit] = useState(false)
  const [modalDays, setModalDays] = useState('7')
  const [modalReason, setModalReason] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')
  const [modalSuccess, setModalSuccess] = useState('')
  // Apply promo state
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [promoForce, setPromoForce] = useState(false)
  const [promoRequiresForce, setPromoRequiresForce] = useState(false)
  // Apply credit state
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')

  // Edit modal state
  const [showEdit, setShowEdit] = useState(false)
  const [editTeamName, setEditTeamName] = useState('')
  const [editLeaderFirstName, setEditLeaderFirstName] = useState('')
  const [editLeaderLastName, setEditLeaderLastName] = useState('')
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

  // Re-enable modal state
  const [showReEnable, setShowReEnable] = useState(false)
  const [reEnableReason, setReEnableReason] = useState('')
  const [reEnableLoading, setReEnableLoading] = useState(false)
  const [reEnableError, setReEnableError] = useState('')
  const [reEnableSuccess, setReEnableSuccess] = useState('')

  // Suspend modal state
  const [showSuspend, setShowSuspend] = useState(false)
  const [suspendReason, setSuspendReason] = useState('chargeback')
  const [suspendNotes, setSuspendNotes] = useState('')
  const [suspendLoading, setSuspendLoading] = useState(false)
  const [suspendError, setSuspendError] = useState('')

  // Billing exempt modal state
  const [showBillingExempt, setShowBillingExempt] = useState(false)
  const [billingExemptTarget, setBillingExemptTarget] = useState(false)
  const [billingExemptReason, setBillingExemptReason] = useState('')
  const [billingExemptLoading, setBillingExemptLoading] = useState(false)
  const [billingExemptError, setBillingExemptError] = useState('')

  // Change plan modal state
  const [showChangePlan, setShowChangePlan] = useState(false)
  const [changePlanValue, setChangePlanValue] = useState('')
  const [changePlanReason, setChangePlanReason] = useState('')
  const [changePlanLoading, setChangePlanLoading] = useState(false)
  const [changePlanError, setChangePlanError] = useState('')

  // Deactivate member modal state
  const [showDeactivateMember, setShowDeactivateMember] = useState(false)
  const [deactivateMemberId, setDeactivateMemberId] = useState('')
  const [deactivateMemberName, setDeactivateMemberName] = useState('')
  const [deactivateMemberReason, setDeactivateMemberReason] = useState('')
  const [deactivateMemberLoading, setDeactivateMemberLoading] = useState(false)
  const [deactivateMemberError, setDeactivateMemberError] = useState('')

  // Reactivate member modal state
  const [showReactivateMember, setShowReactivateMember] = useState(false)
  const [reactivateMemberId, setReactivateMemberId] = useState('')
  const [reactivateMemberName, setReactivateMemberName] = useState('')
  const [reactivateMemberReason, setReactivateMemberReason] = useState('')
  const [reactivateMemberLoading, setReactivateMemberLoading] = useState(false)
  const [reactivateMemberError, setReactivateMemberError] = useState('')

  // Cancel invitation modal state
  const [showCancelInvitation, setShowCancelInvitation] = useState(false)
  const [cancelInvitationId, setCancelInvitationId] = useState('')
  const [cancelInvitationEmail, setCancelInvitationEmail] = useState('')
  const [cancelInvitationReason, setCancelInvitationReason] = useState('')
  const [cancelInvitationLoading, setCancelInvitationLoading] = useState(false)
  const [cancelInvitationError, setCancelInvitationError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [detailRes, emailsRes, lockboxesRes, timelineRes, disputesRes, refundsRes] = await Promise.all([
          fetch(`/api/customers/detail?id=${teamId}`, { cache: 'no-store' }),
          fetch(`/api/customers/emails?team_id=${teamId}`, { cache: 'no-store' }),
          fetch(`/api/customers/lockboxes?team_id=${teamId}`, { cache: 'no-store' }),
          fetch(`/api/customers/timeline?team_id=${teamId}&page=0`, { cache: 'no-store' }),
          fetch(`/api/disputes/list?team_id=${teamId}`, { cache: 'no-store' }),
          fetch(`/api/refunds/list?team_id=${teamId}`, { cache: 'no-store' }),
        ])

        if (!detailRes.ok) {
          if (detailRes.status === 401) { router.push('/login'); return }
          if (detailRes.status === 404) { setError('Customer not found'); return }
          throw new Error('Failed to load')
        }

        const data = await detailRes.json()
        setAccount(data.account)
        setUsage(data.usage)
        setMembers(data.members)
        setInvitations(data.invitations)

        if (emailsRes.ok) {
          const emailsData = await emailsRes.json()
          setEmailHistory(emailsData.emails)
          setEmailSummary(emailsData.summary)
        }

        if (lockboxesRes.ok) {
          const lockboxesData = await lockboxesRes.json()
          setLockboxes(lockboxesData.lockboxes)
          setLockboxSummary(lockboxesData.summary)
        }

        if (timelineRes.ok) {
          const tData = await timelineRes.json()
          setTimeline(tData.events)
          setTimelineHasMore(tData.has_more)
          setTimelinePage(0)
          setTimelineTotal(tData.total)
        }

        if (disputesRes.ok) {
          const dData = await disputesRes.json()
          // Re-sort client-side by most recent first (API returns urgency-first)
          const sorted = [...(dData.disputes as CustomerDispute[])].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          setDisputes(sorted)
          setDisputesSummary({ total: dData.summary.total, action_needed: dData.summary.action_needed })
        }

        if (refundsRes.ok) {
          const rData = await refundsRes.json()
          setRefunds(rData.refunds)
          setRefundsSummary({ total: rData.summary.total, total_amount_succeeded: rData.summary.total_amount_succeeded })
        }
      } catch {
        setError('Failed to load customer details')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [teamId, router])

  useEffect(() => {
    async function fetchAdminRole() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setAdminRole(data.admin?.role || null)
          if (data.admin) setAdminInfo(data.admin)
        }
      } catch {
        // Ignore errors - permission buttons just won't show
      }
    }
    fetchAdminRole()
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

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

  async function handleApplyPromo() {
    setModalError('')
    setModalSuccess('')
    setPromoRequiresForce(false)
    setModalLoading(true)
    try {
      const res = await fetch('/api/customers/apply-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, code: promoCodeInput.toUpperCase().trim(), force: promoForce }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.requiresForce) setPromoRequiresForce(true)
        setModalError(data.error)
        return
      }
      setModalSuccess(data.type === 'extended_trial'
        ? `Trial extended. New end: ${formatDate(data.trial_ends_at)}`
        : 'Discount code applied. It will be applied at next checkout.')
    } catch {
      setModalError('Network error')
    } finally {
      setModalLoading(false)
    }
  }

  async function handleApplyCredit() {
    setModalError('')
    setModalSuccess('')
    setModalLoading(true)
    try {
      const res = await fetch('/api/customers/apply-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, amountCents: creditAmount, reason: creditReason }),
      })
      const data = await res.json()
      if (!res.ok) { setModalError(data.error); return }
      setModalSuccess(`Credit of $${(parseInt(creditAmount) / 100).toFixed(2)} CAD applied successfully.`)
    } catch {
      setModalError('Network error')
    } finally {
      setModalLoading(false)
    }
  }

  function closeModal() {
    setShowExtendTrial(false)
    setShowApplyPromo(false)
    setShowApplyCredit(false)
    setModalDays('7')
    setModalReason('')
    setModalError('')
    setModalSuccess('')
    setPromoCodeInput('')
    setPromoForce(false)
    setPromoRequiresForce(false)
    setCreditAmount('')
    setCreditReason('')
  }

  function openEditModal() {
    if (account) {
      setEditTeamName(account.team_name)
      setEditLeaderFirstName(account.leader?.first_name || '')
      setEditLeaderLastName(account.leader?.last_name || '')
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
    setEditLeaderFirstName('')
    setEditLeaderLastName('')
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
          leaderFirstName: editLeaderFirstName,
          leaderLastName: editLeaderLastName,
          leaderEmail: editLeaderEmail,
          leaderPhone: editLeaderPhone || null,
          reason: editReason,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error); return }
      setEditSuccess('Customer updated successfully')
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
      window.location.href = '/customers?deleted=1'
    } catch {
      setDeleteError('Network error')
    } finally {
      setDeleteLoading(false)
    }
  }

  function openReEnableModal() {
    setReEnableReason('')
    setReEnableError('')
    setReEnableSuccess('')
    setShowReEnable(true)
  }

  function closeReEnableModal() {
    setShowReEnable(false)
    setReEnableReason('')
    setReEnableError('')
    setReEnableSuccess('')
  }

  async function handleReEnable() {
    setReEnableError('')
    setReEnableSuccess('')
    setReEnableLoading(true)
    try {
      const res = await fetch('/api/customers/re-enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, reason: reEnableReason }),
      })
      const data = await res.json()
      if (!res.ok) { setReEnableError(data.error); return }
      setReEnableSuccess('Account re-enabled successfully')
      setAccount((prev) => prev ? {
        ...prev,
        account_status: 'active',
        re_enabled_at: new Date().toISOString(),
      } : prev)
    } catch {
      setReEnableError('Network error')
    } finally {
      setReEnableLoading(false)
    }
  }

  function openSuspendModal() {
    setSuspendReason('chargeback')
    setSuspendNotes('')
    setSuspendError('')
    setShowSuspend(true)
  }

  function closeSuspendModal() {
    setShowSuspend(false)
    setSuspendReason('chargeback')
    setSuspendNotes('')
    setSuspendError('')
  }

  async function handleSuspend() {
    setSuspendError('')
    setSuspendLoading(true)
    try {
      const res = await fetch('/api/customers/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, reason: suspendReason, notes: suspendNotes }),
      })
      const data = await res.json()
      if (!res.ok) { setSuspendError(data.error); return }
      setAccount((prev) => prev ? {
        ...prev,
        account_status: `suspended_${suspendReason}`,
        suspended_at: new Date().toISOString(),
        suspended_reason: suspendNotes || null,
      } : prev)
      closeSuspendModal()
    } catch {
      setSuspendError('Network error')
    } finally {
      setSuspendLoading(false)
    }
  }

  function openBillingExemptModal(targetValue: boolean) {
    setBillingExemptTarget(targetValue)
    setBillingExemptReason('')
    setBillingExemptError('')
    setShowBillingExempt(true)
  }

  function closeBillingExemptModal() {
    setShowBillingExempt(false)
    setBillingExemptReason('')
    setBillingExemptError('')
  }

  async function handleBillingExemptToggle() {
    setBillingExemptError('')
    setBillingExemptLoading(true)
    try {
      const res = await fetch('/api/customers/toggle-billing-exempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, billingExempt: billingExemptTarget, reason: billingExemptReason }),
      })
      const data = await res.json()
      if (!res.ok) { setBillingExemptError(data.error); return }
      setAccount((prev) => prev ? { ...prev, billing_exempt: billingExemptTarget } : prev)
      closeBillingExemptModal()
    } catch {
      setBillingExemptError('Network error')
    } finally {
      setBillingExemptLoading(false)
    }
  }

  function openChangePlanModal() {
    setChangePlanValue(account?.plan_tier || '')
    setChangePlanReason('')
    setChangePlanError('')
    setShowChangePlan(true)
  }

  function closeChangePlanModal() {
    setShowChangePlan(false)
    setChangePlanValue('')
    setChangePlanReason('')
    setChangePlanError('')
  }

  async function handleChangePlan() {
    setChangePlanError('')
    setChangePlanLoading(true)
    try {
      const res = await fetch('/api/customers/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, newPlan: changePlanValue, reason: changePlanReason }),
      })
      const data = await res.json()
      if (!res.ok) { setChangePlanError(data.error); return }
      setAccount((prev) => prev ? { ...prev, plan_tier: changePlanValue } : prev)
      closeChangePlanModal()
    } catch {
      setChangePlanError('Network error')
    } finally {
      setChangePlanLoading(false)
    }
  }

  function openDeactivateMemberModal(member: Member) {
    setDeactivateMemberId(member.id)
    setDeactivateMemberName([member.first_name, member.last_name].filter(Boolean).join(' '))
    setDeactivateMemberReason('')
    setDeactivateMemberError('')
    setShowDeactivateMember(true)
  }

  function closeDeactivateMemberModal() {
    setShowDeactivateMember(false)
    setDeactivateMemberId('')
    setDeactivateMemberName('')
    setDeactivateMemberReason('')
    setDeactivateMemberError('')
  }

  async function handleDeactivateMember() {
    setDeactivateMemberError('')
    setDeactivateMemberLoading(true)
    try {
      const res = await fetch('/api/customers/deactivate-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, userId: deactivateMemberId, reason: deactivateMemberReason }),
      })
      const data = await res.json()
      if (!res.ok) { setDeactivateMemberError(data.error); return }
      setMembers((prev) => prev.map((m) => m.id === deactivateMemberId ? { ...m, is_active: false } : m))
      closeDeactivateMemberModal()
    } catch {
      setDeactivateMemberError('Network error')
    } finally {
      setDeactivateMemberLoading(false)
    }
  }

  function openReactivateMemberModal(member: Member) {
    setReactivateMemberId(member.id)
    setReactivateMemberName([member.first_name, member.last_name].filter(Boolean).join(' '))
    setReactivateMemberReason('')
    setReactivateMemberError('')
    setShowReactivateMember(true)
  }

  function closeReactivateMemberModal() {
    setShowReactivateMember(false)
    setReactivateMemberId('')
    setReactivateMemberName('')
    setReactivateMemberReason('')
    setReactivateMemberError('')
  }

  async function handleReactivateMember() {
    setReactivateMemberError('')
    setReactivateMemberLoading(true)
    try {
      const res = await fetch('/api/customers/reactivate-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, userId: reactivateMemberId, reason: reactivateMemberReason }),
      })
      const data = await res.json()
      if (!res.ok) { setReactivateMemberError(data.error); return }
      setMembers((prev) => prev.map((m) => m.id === reactivateMemberId ? { ...m, is_active: true } : m))
      closeReactivateMemberModal()
    } catch {
      setReactivateMemberError('Network error')
    } finally {
      setReactivateMemberLoading(false)
    }
  }

  function openCancelInvitationModal(inv: Invitation) {
    setCancelInvitationId(inv.id)
    setCancelInvitationEmail(inv.email)
    setCancelInvitationReason('')
    setCancelInvitationError('')
    setShowCancelInvitation(true)
  }

  function closeCancelInvitationModal() {
    setShowCancelInvitation(false)
    setCancelInvitationId('')
    setCancelInvitationEmail('')
    setCancelInvitationReason('')
    setCancelInvitationError('')
  }

  async function handleCancelInvitation() {
    setCancelInvitationError('')
    setCancelInvitationLoading(true)
    try {
      const res = await fetch('/api/customers/cancel-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, invitationId: cancelInvitationId, reason: cancelInvitationReason }),
      })
      const data = await res.json()
      if (!res.ok) { setCancelInvitationError(data.error); return }
      setInvitations((prev) => prev.filter((inv) => inv.id !== cancelInvitationId))
      closeCancelInvitationModal()
    } catch {
      setCancelInvitationError('Network error')
    } finally {
      setCancelInvitationLoading(false)
    }
  }

  function timelineSinceParam(range: '7d' | '30d' | '90d' | 'all'): string {
    if (range === 'all') return ''
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    return `&since=${encodeURIComponent(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())}`
  }

  async function handleDateRangeChange(range: '7d' | '30d' | '90d' | 'all') {
    setTimelineDateRange(range)
    setTimelineTypeFilter('all')
    setTimeline([])
    setTimelinePage(0)
    setTimelineHasMore(false)
    setTimelineLoadingMore(true)
    try {
      const res = await fetch(
        `/api/customers/timeline?team_id=${teamId}&page=0${timelineSinceParam(range)}`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const data = await res.json()
        setTimeline(data.events)
        setTimelineHasMore(data.has_more)
        setTimelineTotal(data.total)
      }
    } catch {
      // silently fail
    } finally {
      setTimelineLoadingMore(false)
    }
  }

  async function loadMoreTimeline() {
    if (timelineLoadingMore || !timelineHasMore) return
    setTimelineLoadingMore(true)
    try {
      const nextPage = timelinePage + 1
      const res = await fetch(
        `/api/customers/timeline?team_id=${teamId}&page=${nextPage}${timelineSinceParam(timelineDateRange)}`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const data = await res.json()
        setTimeline((prev) => [...prev, ...data.events])
        setTimelineHasMore(data.has_more)
        setTimelinePage(nextPage)
      }
    } catch {
      // silently fail
    } finally {
      setTimelineLoadingMore(false)
    }
  }

  // Lockbox filtered view
  const filteredLockboxes = lockboxStatusFilter === 'all'
    ? lockboxes
    : lockboxes.filter((lb) => lb.status === lockboxStatusFilter)

  // Email history filtered view (client-side filter on the already-fetched data)
  const filteredEmails = emailStatusFilter === 'all'
    ? emailHistory
    : emailHistory.filter((e) => e.status === emailStatusFilter)

  // Timeline filtered view (client-side event type filter)
  const filteredTimeline = timelineTypeFilter === 'all'
    ? timeline
    : timeline.filter((e) => e.type === timelineTypeFilter)

  const canEdit = adminRole === 'super_admin' || adminRole === 'support_l2'
  const canDelete = adminRole === 'super_admin'
  const canReEnable = adminRole === 'super_admin' || adminRole === 'support_l2'
  const isSolo = members.some((m) => m.role === 'solo_agent')

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
      <header className="bg-[#0D7377]">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-white/70">
              <a href="/dashboard" className="hover:text-white">SLIM Admin</a>
              <span>/</span>
              <a href="/customers" className="hover:text-white">Customers</a>
              <span>/</span>
              <span className="text-white">{account.team_name}</span>
            </div>
            {adminInfo && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-white/80">
                  {[adminInfo.first_name, adminInfo.last_name].filter(Boolean).join(' ')}{' '}
                  <span className="text-white/60">({ROLE_LABELS[adminInfo.role] || adminInfo.role})</span>
                </span>
                <button onClick={handleLogout} className="text-sm text-white/70 hover:text-white transition-colors">
                  Sign out
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-white">{account.team_name}</h1>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[account.status] || 'bg-white/20 text-white'}`}>
                {STATUS_LABELS[account.status] || account.status}
              </span>
            </div>
            <div className="flex gap-2">
              {account.status === 'active_trial' && (
                <button
                  onClick={() => { closeModal(); setShowExtendTrial(true) }}
                  className="px-3 py-1.5 text-sm rounded border border-white/30 text-white bg-white/15 hover:bg-white/25 transition-colors"
                >
                  Extend Trial
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => { closeModal(); setShowApplyPromo(true) }}
                  className="px-3 py-1.5 text-sm rounded border border-white/30 text-white bg-white/15 hover:bg-white/25 transition-colors"
                >
                  Apply Promo Code
                </button>
              )}
              {account.status === 'active_paid' && canEdit && (
                <button
                  onClick={() => { closeModal(); setShowApplyCredit(true) }}
                  className="px-3 py-1.5 text-sm rounded border border-white/30 text-white bg-white/15 hover:bg-white/25 transition-colors"
                >
                  Apply Credit
                </button>
              )}
              {canEdit && account.account_status === 'active' && (
                <button
                  onClick={openSuspendModal}
                  className="px-3 py-1.5 text-sm rounded border border-red-400/60 text-red-100 bg-red-600/40 hover:bg-red-600/60 transition-colors"
                >
                  Suspend Account
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Suspension Alert */}
        {account.account_status && account.account_status !== 'active' && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-red-700 mb-2">Account Suspended</h2>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-red-600 font-medium">Status</p>
                      <p className="text-red-700">
                        {account.account_status === 'suspended_chargeback' && 'Suspended - Chargeback'}
                        {account.account_status === 'suspended_fraud' && 'Suspended - Fraud'}
                        {account.account_status === 'suspended_abuse' && 'Suspended - Abuse'}
                        {account.account_status === 'suspended_other' && 'Suspended - Other'}
                      </p>
                    </div>
                    <div>
                      <p className="text-red-600 font-medium">Suspended At</p>
                      <p className="text-red-700">{formatDateTime(account.suspended_at)}</p>
                    </div>
                  </div>
                  {account.suspended_reason && (
                    <div>
                      <p className="text-red-600 font-medium">Reason</p>
                      <p className="text-red-700 bg-white/60 rounded px-3 py-2 mt-1">{account.suspended_reason}</p>
                    </div>
                  )}
                  {account.re_enabled_at && (
                    <div className="mt-3 pt-3 border-t border-red-200">
                      <p className="text-green-700 font-medium">Previously Re-enabled</p>
                      <p className="text-sm text-gray-600">Re-enabled at: {formatDateTime(account.re_enabled_at)}</p>
                    </div>
                  )}
                </div>
              </div>
              {canReEnable && (
                <button
                  onClick={openReEnableModal}
                  className="ml-4 px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Re-enable Account
                </button>
              )}
            </div>
          </div>
        )}

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
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-medium">{TIER_LABELS[account.plan_tier] || account.plan_tier}</span>
                {canEdit && (
                  <button
                    onClick={openChangePlanModal}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Change
                  </button>
                )}
              </div>
            </div>
            <div>
              <p className="text-gray-500">Billing Exempt</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`font-medium ${account.billing_exempt ? 'text-purple-700' : 'text-gray-600'}`}>
                  {account.billing_exempt ? 'Yes' : 'No'}
                </span>
                {canEdit && (
                  <button
                    onClick={() => openBillingExemptModal(!account.billing_exempt)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    {account.billing_exempt ? 'Remove' : 'Set'}
                  </button>
                )}
              </div>
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
                {members.length <= 1 ? 'Account Owner' : 'Team Leader'}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Name</p>
                  <p className="font-medium">{[account.leader.first_name, account.leader.last_name].filter(Boolean).join(' ')}</p>
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

        {/* Section C: Lockbox Inventory */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Lockbox Inventory
              {lockboxSummary && (
                <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                  ({lockboxSummary.total} total)
                </span>
              )}
            </h2>
            {lockboxSummary && lockboxSummary.total > 0 && (
              <div className="flex items-center gap-1">
                {(['all', 'installed', 'checked_out', 'in_transit', 'available', 'removed', 'out_of_service'] as const).map((s) => {
                  const count = s === 'all' ? lockboxSummary.total : (lockboxSummary.by_status[s] || 0)
                  if (s !== 'all' && count === 0) return null
                  const isActive = lockboxStatusFilter === s
                  const style = LOCKBOX_STATUS_COLORS[s]
                  return (
                    <button
                      key={s}
                      onClick={() => setLockboxStatusFilter(s)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                        isActive
                          ? 'bg-[#0D7377] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {s === 'all' ? 'All' : (style?.label || s)}
                      {count > 0 && <span className="ml-1 opacity-75">({count})</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {lockboxes.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">No lockboxes added yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-2 font-medium text-gray-600">ID</th>
                  <th className="px-5 py-2 font-medium text-gray-600">Status</th>
                  <th className="px-5 py-2 font-medium text-gray-600">Address</th>
                  <th className="px-5 py-2 font-medium text-gray-600">Assigned To</th>
                  <th className="px-5 py-2 font-medium text-gray-600">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {filteredLockboxes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-gray-400 text-sm">
                      No lockboxes with this status.
                    </td>
                  </tr>
                ) : (
                  filteredLockboxes.map((lb) => {
                    const style = LOCKBOX_STATUS_COLORS[lb.status] || { bg: 'bg-gray-100', text: 'text-gray-600', label: lb.status }
                    const lastActivity = lb.installed_at || lb.removed_at || lb.updated_at
                    return (
                      <tr key={lb.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-2.5 font-mono text-sm font-medium text-gray-800">
                          {lb.lockbox_id}
                        </td>
                        <td className="px-5 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-gray-600 max-w-xs truncate">
                          {lb.current_address || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-gray-600">
                          {lb.assigned_to
                            ? [lb.assigned_to.first_name, lb.assigned_to.last_name].filter(Boolean).join(' ')
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">
                          {formatDateTime(lastActivity)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Section D: Team Members */}
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
                {canEdit && <th className="px-5 py-2 font-medium text-gray-600">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-gray-50">
                  <td className="px-5 py-2.5 font-medium">{[m.first_name, m.last_name].filter(Boolean).join(' ')}</td>
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
                  {canEdit && (
                    <td className="px-5 py-2.5">
                      {m.role !== 'team_leader' && m.role !== 'solo_agent' ? (
                        m.is_active ? (
                          <button
                            onClick={() => openDeactivateMemberModal(m)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => openReactivateMemberModal(m)}
                            className="text-xs text-green-600 hover:text-green-800 font-medium"
                          >
                            Reactivate
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {invitations.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 bg-yellow-50/50">
                  <td className="px-5 py-2.5 font-medium text-gray-500">{[inv.first_name, inv.last_name].filter(Boolean).join(' ')}</td>
                  <td className="px-5 py-2.5 text-gray-500">{inv.email}</td>
                  <td className="px-5 py-2.5 text-gray-500">{ROLE_LABELS[inv.role] || inv.role}</td>
                  <td className="px-5 py-2.5 text-gray-400">—</td>
                  <td className="px-5 py-2.5">
                    <span className="text-yellow-600 text-xs font-medium bg-yellow-100 px-1.5 py-0.5 rounded">
                      Pending · expires {formatDate(inv.expires_at)}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-5 py-2.5">
                      <button
                        onClick={() => openCancelInvitationModal(inv)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Cancel
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section D: Email History */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Email History
              {emailSummary && (
                <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                  (last 90 days · {emailSummary.total} sent)
                </span>
              )}
            </h2>
            {/* Status filter tabs */}
            {emailSummary && (
              <div className="flex items-center gap-1">
                {(['all', 'sent', 'delivered', 'opened', 'clicked', 'bounced'] as const).map((s) => {
                  const count = s === 'all' ? emailSummary.total : (emailSummary.by_status[s] || 0)
                  const isActive = emailStatusFilter === s
                  return (
                    <button
                      key={s}
                      onClick={() => setEmailStatusFilter(s)}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                        isActive
                          ? 'bg-[#0D7377] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                      {count > 0 && <span className="ml-1 opacity-75">({count})</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bounce alert bar */}
          {emailSummary && emailSummary.by_status.bounced > 0 && (
            <div className="px-5 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
              <span className="text-orange-500 text-sm">⚠</span>
              <p className="text-sm text-orange-800">
                <strong>{emailSummary.by_status.bounced} bounce{emailSummary.by_status.bounced !== 1 ? 's' : ''}</strong>
                {' '}in last 90 days
                <span className="ml-2 text-orange-600">({emailSummary.bounce_rate}% bounce rate)</span>
              </p>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-5 py-2 font-medium text-gray-600">Status</th>
                <th className="px-5 py-2 font-medium text-gray-600">Type</th>
                <th className="px-5 py-2 font-medium text-gray-600">Recipient</th>
                <th className="px-5 py-2 font-medium text-gray-600">Subject</th>
                <th className="px-5 py-2 font-medium text-gray-600">Sent</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmails.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">
                    {emailSummary?.total === 0 ? 'No emails sent in last 90 days.' : `No ${emailStatusFilter} emails in last 90 days.`}
                  </td>
                </tr>
              ) : (
                filteredEmails.map((email) => {
                  const statusStyle = EMAIL_STATUS_COLORS[email.status] || EMAIL_STATUS_COLORS.sent
                  const badgeStyle = getTemplateBadgeStyle(email.template_key)
                  return (
                    <tr key={email.id} className={`border-b border-gray-50 hover:bg-gray-50 ${email.status === 'bounced' ? 'bg-red-50/30' : ''}`}>
                      <td className="px-5 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          {email.status}
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badgeStyle.bg} ${badgeStyle.text}`}>
                            {badgeStyle.label}
                          </span>
                          <span className="text-gray-500 text-xs">{formatTemplateLabel(email.template_key)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-gray-700">{email.recipient}</td>
                      <td className="px-5 py-2.5 text-gray-600 max-w-xs truncate">{email.subject}</td>
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{formatDateTime(email.sent_at)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          {filteredEmails.length >= 100 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                Showing 100 most recent. Total in range: {emailSummary?.total}
              </p>
            </div>
          )}
        </div>

        {/* Section E: Billing History */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Billing History</h2>
          </div>

          {/* Disputes subsection */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Disputes & Chargebacks</h3>
              {disputesSummary && disputesSummary.total > 0 && (
                <span className="text-sm text-gray-500">
                  {disputesSummary.total} dispute{disputesSummary.total !== 1 ? 's' : ''}
                  {disputesSummary.action_needed > 0 && (
                    <span className="text-red-600"> · {disputesSummary.action_needed} needs response</span>
                  )}
                </span>
              )}
            </div>

            {/* Won dispute + account still suspended warning */}
            {account.account_status !== 'active' && disputes.some((d) => d.status === 'won') && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                A dispute was won but this account remains suspended. Use the <strong>Re-enable Account</strong> button above to restore access.
              </div>
            )}

            {disputes.length === 0 ? (
              <p className="text-sm text-gray-400">No disputes or chargebacks</p>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-gray-100 bg-gray-50 text-left">
                      <th className="px-5 py-2 font-medium text-gray-600">Amount</th>
                      <th className="px-5 py-2 font-medium text-gray-600">Reason</th>
                      <th className="px-5 py-2 font-medium text-gray-600">Status</th>
                      <th className="px-5 py-2 font-medium text-gray-600">Evidence Due</th>
                      <th className="px-5 py-2 font-medium text-gray-600">Date</th>
                      <th className="px-5 py-2 font-medium text-gray-600 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputes.map((d) => {
                      const statusCfg = DISPUTE_STATUS_CONFIG[d.status] ?? { label: d.status, bg: 'bg-gray-100', text: 'text-gray-600' }
                      const rowBg = DISPUTE_URGENCY_ROW[d.urgency]
                      return (
                        <tr key={d.id} className={`border-b border-gray-50 ${rowBg}`}>
                          <td className="px-5 py-2.5 font-medium">{formatCents(d.amount, d.currency)}</td>
                          <td className="px-5 py-2.5 text-gray-600">{DISPUTE_REASON_LABELS[d.reason] ?? d.reason}</td>
                          <td className="px-5 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-2.5">
                            <span className={`text-xs ${
                              d.urgency === 'critical' ? 'text-red-700 font-medium' :
                              d.urgency === 'urgent'   ? 'text-orange-700' :
                              d.urgency === 'warning'  ? 'text-yellow-700' : 'text-gray-600'
                            }`}>
                              {formatDeadline(d.hours_remaining, d.evidence_due_by)}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(d.created_at)}</td>
                          <td className="px-5 py-2.5">
                            <a
                              href={`https://dashboard.stripe.com/disputes/${d.stripe_dispute_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="View in Stripe"
                            >
                              ↗
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Refunds subsection */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Refunds</h3>
              {refundsSummary && refundsSummary.total > 0 && (
                <span className="text-sm text-gray-500">
                  {refundsSummary.total} refund{refundsSummary.total !== 1 ? 's' : ''}
                  {refundsSummary.total_amount_succeeded > 0 && (
                    <span> · {formatCents(refundsSummary.total_amount_succeeded, 'usd')} refunded</span>
                  )}
                </span>
              )}
            </div>

            {refunds.length === 0 ? (
              <p className="text-sm text-gray-400">No refunds issued</p>
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-gray-100 bg-gray-50 text-left">
                      <th className="px-5 py-2 font-medium text-gray-600">Amount</th>
                      <th className="px-5 py-2 font-medium text-gray-600">Reason</th>
                      <th className="px-5 py-2 font-medium text-gray-600">Status</th>
                      <th className="px-5 py-2 font-medium text-gray-600">Date</th>
                      <th className="px-5 py-2 font-medium text-gray-600 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map((r) => {
                      const statusCfg = REFUND_STATUS_CONFIG[r.status] ?? { label: r.status, bg: 'bg-gray-100', text: 'text-gray-600' }
                      return (
                        <tr key={r.id} className="border-b border-gray-50">
                          <td className="px-5 py-2.5 font-medium">{formatCents(r.amount_refunded, r.currency)}</td>
                          <td className="px-5 py-2.5 text-gray-600">
                            {r.reason ? (REFUND_REASON_LABELS[r.reason] ?? r.reason) : '—'}
                          </td>
                          <td className="px-5 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(r.created_at)}</td>
                          <td className="px-5 py-2.5">
                            <a
                              href={`https://dashboard.stripe.com/payments/${r.stripe_charge_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="View in Stripe"
                            >
                              ↗
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Section F: Activity Timeline */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Activity Timeline
                {timelineTotal > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400 normal-case">
                    ({timelineTotal} in period)
                  </span>
                )}
              </h2>
              {/* Date range selector */}
              <div className="flex items-center gap-1">
                {([
                  { key: '7d',  label: 'Last 7d' },
                  { key: '30d', label: 'Last 30d' },
                  { key: '90d', label: 'Last 90d' },
                  { key: 'all', label: 'All time' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handleDateRangeChange(key)}
                    className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                      timelineDateRange === key
                        ? 'bg-[#0D7377] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Event type filter tabs */}
            <div className="flex items-center gap-1 mt-3">
              {([
                { key: 'all',           label: 'All',    dot: null },
                { key: 'lockbox_action',label: 'Lockbox',dot: 'bg-blue-400' },
                { key: 'email_sent',    label: 'Email',  dot: 'bg-purple-400' },
                { key: 'admin_action',  label: 'Admin',  dot: 'bg-amber-400' },
              ] as const).map(({ key, label, dot }) => (
                <button
                  key={key}
                  onClick={() => setTimelineTypeFilter(key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                    timelineTypeFilter === key
                      ? 'bg-[#0D7377] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {dot && <span className={`w-1.5 h-1.5 rounded-full ${timelineTypeFilter === key ? 'bg-white' : dot}`} />}
                  {label}
                  {key !== 'all' && (
                    <span className="opacity-70">
                      ({timeline.filter(e => e.type === key).length})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {timelineLoadingMore && timeline.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : filteredTimeline.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              {timeline.length === 0 ? 'No activity in this period.' : 'No events of this type in this period.'}
            </div>
          ) : (
            <div className="px-5 py-4">
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-3.5 top-2 bottom-2 w-px bg-gray-200" />

                <div className="space-y-0">
                  {filteredTimeline.map((event) => {
                    const isLockbox = event.type === 'lockbox_action'
                    const isEmail = event.type === 'email_sent'
                    const dotColor = isLockbox ? 'bg-blue-400' : isEmail ? 'bg-purple-400' : 'bg-amber-400'
                    const badgeBg = isLockbox ? 'bg-blue-50 text-blue-700' : isEmail ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700'
                    const typeLabel = isLockbox ? 'Lockbox' : isEmail ? 'Email' : 'Admin'

                    return (
                      <div key={event.id} className="relative flex gap-4 pb-4">
                        {/* Dot */}
                        <div className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full ${dotColor} flex items-center justify-center mt-0.5`}>
                          {isLockbox && <span className="text-white text-xs">L</span>}
                          {isEmail && <span className="text-white text-xs">E</span>}
                          {!isLockbox && !isEmail && <span className="text-white text-xs">A</span>}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 bg-gray-50 rounded-lg px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badgeBg}`}>
                                {typeLabel}
                              </span>
                              <span className="text-sm font-medium text-gray-800">{event.title}</span>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                              {formatDateTime(event.timestamp)}
                            </span>
                          </div>
                          {event.subtitle && (
                            <p className="text-xs text-gray-500 mt-0.5">{event.subtitle}</p>
                          )}
                          {event.actor && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {event.actor.role === 'admin' ? 'By admin: ' : 'By: '}
                              <span className="text-gray-500">{event.actor.name || event.actor.email}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {timelineHasMore && timelineTypeFilter === 'all' && (
                <div className="mt-2 text-center">
                  <button
                    onClick={loadMoreTimeline}
                    disabled={timelineLoadingMore}
                    className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {timelineLoadingMore ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
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
                <button onClick={closeModal} className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163]">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Apply Promo Code Modal */}
      {showApplyPromo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Apply Promo Code</h3>
            <p className="text-sm text-gray-500 mb-4">
              Apply a promo code to <strong>{account?.team_name}</strong>.
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Promo Code</label>
                  <input
                    type="text"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. WELCOME30"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {promoRequiresForce && (
                  <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input type="checkbox" checked={promoForce} onChange={e => setPromoForce(e.target.checked)} className="rounded" />
                    <span className="text-sm text-red-600">Override restriction and apply anyway</span>
                  </label>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                  <button
                    onClick={handleApplyPromo}
                    disabled={modalLoading || !promoCodeInput.trim()}
                    className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {modalLoading ? 'Applying...' : 'Apply Code'}
                  </button>
                </div>
              </>
            )}
            {modalSuccess && (
              <div className="flex justify-end">
                <button onClick={closeModal} className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163]">Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Apply Credit Modal */}
      {showApplyCredit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Apply Credit</h3>
            <p className="text-sm text-gray-500 mb-4">
              Apply a CAD credit to <strong>{account?.team_name}</strong>&apos;s Stripe balance. This will offset future invoices.
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (cents CAD)</label>
                  <input
                    type="number"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    placeholder="e.g. 449 = $4.49"
                    min="1" max="100000"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {creditAmount && <p className="text-xs text-gray-500 mt-1">${(parseInt(creditAmount) / 100).toFixed(2)} CAD</p>}
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
                  <textarea
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Why is this credit being applied?"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                  <button
                    onClick={handleApplyCredit}
                    disabled={modalLoading || !creditAmount || !creditReason.trim()}
                    className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {modalLoading ? 'Applying...' : 'Apply Credit'}
                  </button>
                </div>
              </>
            )}
            {modalSuccess && (
              <div className="flex justify-end">
                <button onClick={closeModal} className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163]">Done</button>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {isSolo ? 'Account Name' : 'Team Name'}
                    </label>
                    <input
                      type="text"
                      value={editTeamName}
                      onChange={(e) => setEditTeamName(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                      <input
                        type="text"
                        value={editLeaderFirstName}
                        onChange={(e) => setEditLeaderFirstName(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={editLeaderLastName}
                        onChange={(e) => setEditLeaderLastName(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={editLeaderEmail}
                      onChange={(e) => setEditLeaderEmail(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
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
                    disabled={editLoading || !editTeamName.trim() || !editLeaderFirstName.trim() || !editLeaderEmail.trim() || !editReason.trim()}
                    className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </>
            )}
            {editSuccess && (
              <div className="flex justify-end">
                <button onClick={closeEditModal} className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163]">
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

      {/* Re-enable Account Modal */}
      {showReEnable && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeReEnableModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-green-700 mb-4">Re-enable Account</h3>
            <p className="text-sm text-gray-500 mb-4">
              Re-enable the suspended account for <strong>{account.team_name}</strong>.
              This will restore access for all team members.
            </p>
            {reEnableError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{reEnableError}</div>
            )}
            {reEnableSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded px-3 py-2 mb-3">{reEnableSuccess}</div>
            )}
            {!reEnableSuccess && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required, min 10 characters)</label>
                  <textarea
                    value={reEnableReason}
                    onChange={(e) => setReEnableReason(e.target.value)}
                    rows={3}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Why is this account being re-enabled?"
                  />
                  <p className="text-xs text-gray-400 mt-1">{reEnableReason.length}/10 characters minimum</p>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={closeReEnableModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                    Cancel
                  </button>
                  <button
                    onClick={handleReEnable}
                    disabled={reEnableLoading || reEnableReason.trim().length < 10}
                    className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {reEnableLoading ? 'Re-enabling...' : 'Re-enable Account'}
                  </button>
                </div>
              </>
            )}
            {reEnableSuccess && (
              <div className="flex justify-end">
                <button onClick={closeReEnableModal} className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163]">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Suspend Account Modal */}
      {showSuspend && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeSuspendModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-red-700 mb-2">Suspend Account</h3>
            <p className="text-sm text-gray-500 mb-4">
              Suspend <strong>{account.team_name}</strong>. All team members will immediately lose access.
            </p>
            {suspendError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{suspendError}</div>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
                <select
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="chargeback">Chargeback</option>
                  <option value="fraud">Fraud</option>
                  <option value="abuse">Abuse</option>
                  <option value="non_payment">Non-Payment</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={suspendNotes}
                  onChange={(e) => setSuspendNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Additional context or details..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeSuspendModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                disabled={suspendLoading}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suspendLoading ? 'Suspending...' : 'Suspend Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {showChangePlan && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeChangePlanModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Change Plan</h3>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
              <p className="text-xs text-amber-800">
                <strong>Note:</strong> This updates the account&apos;s plan limits immediately but does <strong>not</strong> change Stripe billing.
                Update the subscription in Stripe separately if needed.
              </p>
            </div>
            {changePlanError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{changePlanError}</div>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Plan</label>
                <select
                  value={changePlanValue}
                  onChange={(e) => setChangePlanValue(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(TIER_LABELS).map(([value, label]) => (
                    <option key={value} value={value} disabled={value === account?.plan_tier}>
                      {label}{value === account?.plan_tier ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
                <textarea
                  value={changePlanReason}
                  onChange={(e) => setChangePlanReason(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Why is this plan being changed?"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeChangePlanModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleChangePlan}
                disabled={changePlanLoading || changePlanValue === account?.plan_tier || changePlanReason.trim().length < 3}
                className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {changePlanLoading ? 'Saving...' : 'Change Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Billing Exempt Modal */}
      {showBillingExempt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeBillingExemptModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {billingExemptTarget ? 'Set Billing Exempt' : 'Remove Billing Exempt'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {billingExemptTarget
                ? `Mark ${account.team_name} as billing exempt. They will not be charged for their subscription.`
                : `Remove billing exemption for ${account.team_name}. Normal billing will apply.`}
            </p>
            {billingExemptError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{billingExemptError}</div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
              <textarea
                value={billingExemptReason}
                onChange={(e) => setBillingExemptReason(e.target.value)}
                rows={2}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Why is billing exempt being changed?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeBillingExemptModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleBillingExemptToggle}
                disabled={billingExemptLoading || billingExemptReason.trim().length < 3}
                className="px-4 py-2 text-sm rounded bg-[#0D7377] text-white hover:bg-[#0B6163] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {billingExemptLoading ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Member Modal */}
      {showDeactivateMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeDeactivateMemberModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Deactivate Team Member</h3>
            <p className="text-sm text-gray-500 mb-4">
              Deactivate <strong>{deactivateMemberName}</strong>. They will lose access to the team account.
            </p>
            {deactivateMemberError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{deactivateMemberError}</div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
              <textarea
                value={deactivateMemberReason}
                onChange={(e) => setDeactivateMemberReason(e.target.value)}
                rows={2}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Why is this member being deactivated?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeDeactivateMemberModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleDeactivateMember}
                disabled={deactivateMemberLoading || deactivateMemberReason.trim().length < 3}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deactivateMemberLoading ? 'Deactivating...' : 'Deactivate Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate Member Modal */}
      {showReactivateMember && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeReactivateMemberModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reactivate Team Member</h3>
            <p className="text-sm text-gray-500 mb-4">
              Reactivate <strong>{reactivateMemberName}</strong>. They will regain access to the team account.
            </p>
            {reactivateMemberError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{reactivateMemberError}</div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
              <textarea
                value={reactivateMemberReason}
                onChange={(e) => setReactivateMemberReason(e.target.value)}
                rows={2}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Why is this member being reactivated?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeReactivateMemberModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={handleReactivateMember}
                disabled={reactivateMemberLoading || reactivateMemberReason.trim().length < 3}
                className="px-4 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reactivateMemberLoading ? 'Reactivating...' : 'Reactivate Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Invitation Modal */}
      {showCancelInvitation && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeCancelInvitationModal}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel Invitation</h3>
            <p className="text-sm text-gray-500 mb-4">
              Cancel the pending invitation for <strong>{cancelInvitationEmail}</strong>.
              They will no longer be able to accept this invite.
            </p>
            {cancelInvitationError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{cancelInvitationError}</div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
              <textarea
                value={cancelInvitationReason}
                onChange={(e) => setCancelInvitationReason(e.target.value)}
                rows={2}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                placeholder="Why is this invitation being cancelled?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={closeCancelInvitationModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Keep Invitation
              </button>
              <button
                onClick={handleCancelInvitation}
                disabled={cancelInvitationLoading || cancelInvitationReason.trim().length < 3}
                className="px-4 py-2 text-sm rounded bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelInvitationLoading ? 'Cancelling...' : 'Cancel Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
