'use client'

interface AdminNavProps {
  active: string
  role: string | null
}

export function AdminNav({ active, role }: AdminNavProps) {
  const navItems: { href: string; key: string; label: string; superAdminOnly?: boolean }[] = [
    { href: '/dashboard',   key: 'dashboard',   label: 'Dashboard' },
    { href: '/customers',   key: 'customers',   label: 'Customers' },
    { href: '/disputes',    key: 'disputes',    label: 'Disputes' },
    { href: '/refunds',     key: 'refunds',     label: 'Refunds' },
    { href: '/alerts',       key: 'alerts',       label: 'Alerts' },
    { href: '/errors',       key: 'errors',       label: 'Errors' },
    { href: '/audit',        key: 'audit',        label: 'Audit Log' },
    { href: '/promo-codes',  key: 'promo-codes',  label: 'Promo Codes' },
    { href: '/admin-users',  key: 'admin-users',  label: 'Admin Users', superAdminOnly: true },
  ]

  return (
    <nav className="bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 flex gap-6 text-sm">
        {navItems.map(({ href, key, label, superAdminOnly }) => {
          if (superAdminOnly && role !== 'super_admin') return null
          const isActive = active === key
          return (
            <a
              key={key}
              href={href}
              className={`py-2.5 border-b-2 transition-colors ${
                isActive
                  ? 'border-[#0D7377] text-[#0D7377] font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
