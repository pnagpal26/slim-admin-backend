import { NextResponse, NextRequest } from 'next/server'

const ADMIN_COOKIE = 'slim_admin_token'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(ADMIN_COOKIE)?.value

  // Protect /dashboard and /api routes (except /api/auth/login)
  const isProtectedPage =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/customers') ||
    pathname.startsWith('/alerts') ||
    pathname.startsWith('/errors') ||
    pathname.startsWith('/audit') ||
    pathname.startsWith('/admin-users')
  const isProtectedApi = pathname.startsWith('/api') && !pathname.startsWith('/api/auth/login') && !pathname.startsWith('/api/auth/setup')
  const isSetupPage = pathname.startsWith('/setup')

  if (isProtectedPage || isProtectedApi) {
    if (!token) {
      if (isProtectedApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', req.url))
    }

    try {
      const parts = token.split('.')
      if (parts.length !== 3) throw new Error('Invalid token')
      const payload = JSON.parse(atob(parts[1]))
      if (payload.exp * 1000 < Date.now()) {
        if (isProtectedApi) {
          return NextResponse.json({ error: 'Token expired' }, { status: 401 })
        }
        return NextResponse.redirect(new URL('/login', req.url))
      }
    } catch {
      if (isProtectedApi) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      }
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  // If logged in and visiting /login, redirect to dashboard
  if (pathname === '/login' && token) {
    try {
      const parts = token.split('.')
      const payload = JSON.parse(atob(parts[1]))
      if (payload.exp * 1000 > Date.now()) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    } catch {
      // Token invalid, let them see login
    }
  }

  // /setup page doesn't require auth (it's for accepting invitations)
  if (isSetupPage) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/customers/:path*', '/alerts/:path*', '/errors/:path*', '/audit/:path*', '/admin-users/:path*', '/api/:path*', '/login', '/setup/:path*'],
}
