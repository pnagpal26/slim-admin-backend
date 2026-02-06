/**
 * Seed the initial Super Admin user.
 *
 * Usage:
 *   cd admin-backend
 *   npx tsx scripts/seed-admin.ts
 *
 * You will be prompted for email, name, and password, or set them via env vars:
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_FIRST_NAME=Jane SEED_ADMIN_LAST_NAME=Smith SEED_ADMIN_PASSWORD=yourpassword npx tsx scripts/seed-admin.ts
 */

import { createClient } from '@supabase/supabase-js'
import bcryptjs from 'bcryptjs'
import * as readline from 'readline'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  console.error('Make sure .env.local is loaded or set them inline.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || (await prompt('Admin email: '))
  const firstName = process.env.SEED_ADMIN_FIRST_NAME || (await prompt('Admin first name: '))
  const lastName = process.env.SEED_ADMIN_LAST_NAME || (await prompt('Admin last name: '))
  const password = process.env.SEED_ADMIN_PASSWORD || (await prompt('Admin password: '))

  if (!email || !firstName || !password) {
    console.error('Email, first name, and password are all required.')
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(1)
  }

  // Check if admin already exists
  const { data: existing } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single()

  if (existing) {
    console.error(`Admin user with email ${email} already exists.`)
    process.exit(1)
  }

  const salt = await bcryptjs.genSalt(12)
  const password_hash = await bcryptjs.hash(password, salt)

  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      email: email.toLowerCase(),
      first_name: firstName,
      last_name: lastName || '',
      password_hash,
      role: 'super_admin',
      is_active: true,
    })
    .select('id, email, first_name, last_name, role')
    .single()

  if (error) {
    console.error('Failed to create admin user:', error.message)
    process.exit(1)
  }

  console.log('\nSuper Admin created successfully:')
  console.log(`  ID:    ${data.id}`)
  console.log(`  Email: ${data.email}`)
  console.log(`  Name:  ${[data.first_name, data.last_name].filter(Boolean).join(' ')}`)
  console.log(`  Role:  ${data.role}`)
}

main()
