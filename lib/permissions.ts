import { AdminTokenPayload } from './auth'

export type AdminRole = 'super_admin' | 'support_l1' | 'support_l2'

// Permission definitions from PRD section 4.8
const PERMISSIONS = {
  // Customer actions
  extend_trial: ['super_admin', 'support_l2'],
  comp_month: ['super_admin', 'support_l2'],
  edit_customer: ['super_admin', 'support_l2'],
  delete_customer: ['super_admin'],

  // Error management
  mark_error_resolved: ['super_admin', 'support_l1', 'support_l2'],

  // Audit
  export_audit_log: ['super_admin', 'support_l1', 'support_l2'],

  // Admin user management
  invite_admin: ['super_admin'],
  deactivate_admin: ['super_admin'],
  edit_admin: ['super_admin'],
  change_role_admin: ['super_admin'],
  reactivate_admin: ['super_admin'],
  delete_admin: ['super_admin'],
  view_admin_users: ['super_admin'],

  // Views
  view_customers: ['super_admin', 'support_l1', 'support_l2'],
  view_customer_detail: ['super_admin', 'support_l1', 'support_l2'],
  view_system_health: ['super_admin', 'support_l1', 'support_l2'],
  view_alerts: ['super_admin', 'support_l1', 'support_l2'],
  view_error_log: ['super_admin', 'support_l1', 'support_l2'],
  view_audit_history: ['super_admin', 'support_l1', 'support_l2'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(admin: AdminTokenPayload, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission]
  return (allowed as readonly string[]).includes(admin.role)
}

export function requirePermission(admin: AdminTokenPayload, permission: Permission): void {
  if (!hasPermission(admin, permission)) {
    throw new PermissionError(`Role '${admin.role}' cannot perform '${permission}'`)
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}
