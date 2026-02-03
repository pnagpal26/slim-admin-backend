import bcryptjs from 'bcryptjs'
import jwt from 'jsonwebtoken'

// Admin JWT uses a SEPARATE secret from the main app
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET!

export interface AdminTokenPayload {
  adminId: string
  role: 'super_admin' | 'support_l1' | 'support_l2'
  email: string
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(12)
  return bcryptjs.hash(password, salt)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash)
}

export function createAdminToken(adminId: string, role: string, email: string): string {
  return jwt.sign({ adminId, role, email }, ADMIN_JWT_SECRET, { expiresIn: '8h' })
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    return jwt.verify(token, ADMIN_JWT_SECRET) as AdminTokenPayload
  } catch {
    return null
  }
}

export const ADMIN_COOKIE_NAME = 'slim_admin_token'
