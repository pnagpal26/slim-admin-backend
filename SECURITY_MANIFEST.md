# SECURITY MANIFEST — The Prime Directive
## SLIM (Smart Lockbox Inventory Management)

**Version:** 1.1
**Last Updated:** February 7, 2026
**Status:** APPROVED — Remediation Phase Active
**Reviewed By:** Gemini (Google) — Formal approval granted February 7, 2026

> **READ THIS BEFORE MAKING ANY CHANGES.**
> This manifest governs all code in this repository. No commit, feature, or fix ships without compliance. Security overrides speed, convenience, and feature requests. When in doubt, err on the side of security.

---

## Why This Matters

**Address + Code = Complete Access to Someone's Home.**

SLIM stores property addresses and encrypted lockbox codes. A breach gives attackers physical access to private residences. This is not a theoretical risk — it is catastrophic liability, criminal exposure, and a business-ending event.

---

## Absolute Rules

These rules have no exceptions. They apply to every file, every route, every query, every commit.

### 1. Lockbox Codes Are Sacred

- Codes are NEVER stored in plain text — anywhere, ever
- Codes are NEVER logged — not in application logs, error logs, debug output, or console statements
- Codes are NEVER exposed in the admin backend — no admin role can view them, including Super Admin
- Codes are decrypted server-side only, never sent to the browser in encrypted form
- Every code access is logged in the immutable audit trail
- `code_encrypted` column is excluded from ALL admin backend queries
- `sanitizeRequestBody()` MUST strip `password` and `code` fields before any error logging

### 2. No Service Role Key in User-Facing Code

- The application connects to Supabase using `SUPABASE_ANON_KEY` for all user-facing requests
- `SUPABASE_SERVICE_ROLE_KEY` bypasses ALL Row Level Security and is restricted to:
  - Cron jobs (`/api/cron/*`)
  - Admin backend operations
  - Stripe webhooks (`/api/stripe/webhook`)
  - Resend webhooks (`/api/resend/webhook`)
  - Operations that explicitly require cross-tenant access
- If you are writing a new API route that serves user requests, use the anon key. No exceptions.
- If you believe a route needs the service role key, document why in the code and in a PR comment.

### 3. Row Level Security on All Customer Data Tables

Every table that stores customer data MUST have RLS enabled with enforced policies. This includes all current tables and any table created in the future that contains data scoped to a team, user, or customer.

**Current RLS-protected tables:** `teams`, `users`, `lockboxes`, `photos`, `audit_log`, `sent_emails`, `user_notification_preferences`, `invitations`

**Rule for new tables:** If a new table contains a `team_id`, `user_id`, or any column that scopes data to a customer, it MUST have RLS enabled and policies applied before the migration is considered complete. No table containing customer data ships without RLS.

**RLS Helper Function — MANDATORY PATTERN:**

Do NOT query the `users` table directly inside RLS policies. This causes circular dependency when `users` itself has RLS enabled. Always use the helper function:

```sql
-- This function MUST exist and MUST be used in all RLS policies
CREATE OR REPLACE FUNCTION public.get_user_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.users
  WHERE id = current_setting('app.user_id', true)::uuid;
$$;
```

**Why each keyword matters:**
- `SECURITY DEFINER` — runs with function owner's privileges, bypasses RLS on `users` table to avoid circular evaluation
- `SET search_path = public` — prevents search_path injection attacks (malicious functions in other schemas)
- `current_setting('app.user_id', true)` — `true` returns NULL instead of error if setting doesn't exist (graceful handling for service role connections)
- `STABLE` — same result within a single statement, enables query optimization

**RLS Policy Pattern:**

```sql
-- Apply this pattern to every customer data table
CREATE POLICY "select_team_data" ON [table_name]
  FOR SELECT USING (team_id = public.get_user_team_id());

CREATE POLICY "insert_team_data" ON [table_name]
  FOR INSERT WITH CHECK (team_id = public.get_user_team_id());

CREATE POLICY "update_team_data" ON [table_name]
  FOR UPDATE USING (team_id = public.get_user_team_id());

CREATE POLICY "delete_team_data" ON [table_name]
  FOR DELETE USING (team_id = public.get_user_team_id());
```

For tables scoped to user (not team), use `user_id = current_setting('app.user_id', true)::uuid` directly.

### 4. Audit Log Is Immutable

The `audit_log` table has a database-level trigger that prevents modification:

```sql
CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records cannot be modified or deleted';
END;
$$;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_modification();
```

Do not attempt to UPDATE or DELETE from `audit_log`. If you need to correct audit data, insert a new corrective record.

### 5. All Input Validated with Zod

Every API route MUST validate input with Zod schemas before any database operation:

```typescript
import { z } from 'zod';

const schema = z.object({
  lockbox_id: z.string().min(1).max(50),
  // ... define all expected fields
});

const validated = schema.parse(requestBody);
// Use 'validated' from here, never raw requestBody
```

No raw `req.body` or `req.query` values should reach a database query without schema validation.

### 6. AWS Region Lock — ca-central-1

All AWS SDK clients and CLI commands MUST explicitly specify `region: 'ca-central-1'`. Never rely on default region, environment variables, or AWS profile configuration.

```typescript
// CORRECT — explicit region on every client
const kms = new KMSClient({ region: 'ca-central-1' });
const secrets = new SecretsManagerClient({ region: 'ca-central-1' });

// WRONG — relying on defaults
const kms = new KMSClient({}); // NEVER
```

```bash
# CORRECT
aws kms create-key --region ca-central-1 ...

# WRONG
aws kms create-key ...  # NEVER
```

**Why:** PIPEDA compliance. Canadian customer data and encryption keys must stay in Canada. A misconfigured region routes key material through US data centers, violating Canadian privacy law.

### 7. Parameterized Queries Only

All database queries MUST use parameterized queries via the Supabase client. No string concatenation or template literals in SQL.

```typescript
// CORRECT
const { data } = await supabase
  .from('lockboxes')
  .select('*')
  .eq('team_id', teamId);

// WRONG — SQL injection risk
const { data } = await supabase.rpc('raw_query', {
  sql: `SELECT * FROM lockboxes WHERE team_id = '${teamId}'`
});
```

### 8. Exact Dependency Versions

All npm dependencies use exact version pinning. No `^` or `~` prefixes.

```bash
# CORRECT
npm install some-package --save-exact

# Verify in package.json: "some-package": "1.2.3" (not "^1.2.3")
```

Configure `.npmrc` with `save-exact=true` to enforce automatically.

### 9. Secrets Never in Code

No API keys, tokens, passwords, or secrets in source code — ever. Not in comments, not in examples, not in test files. Use environment variables or AWS Secrets Manager.

If you see a hardcoded secret in existing code, flag it immediately.

---

## Encryption Standard

**Algorithm:** AES-256-GCM (NIST-approved)
**Key source:** Currently `ENCRYPTION_KEY` env var (32-byte hex), migrating to AWS KMS envelope encryption
**IV:** Random 12-byte IV per encryption (never reused)
**Format:** `encrypted_hex:auth_tag_hex` with separate `iv` column
**Decryption:** Server-side only, via explicit code-view endpoint
**UI behavior:** Code auto-hidden after 30 seconds, user must re-request

---

## Authentication Architecture

- Custom JWT (not Supabase Auth) with bcrypt password hashing
- Main app cookie: `slim_token` (HttpOnly, Secure, SameSite=Strict)
- Admin app cookie: `slim_admin_token` (separate JWT secret)
- hCaptcha after 3 failed login attempts
- Account lockout for 15 minutes after 5 failed attempts
- Password reset tokens: 15-minute expiry
- Email verification tokens: 24-hour expiry

**Admin roles:**
- Super Admin: full access
- Support L2: view all, take actions, impersonate — cannot manage admins or see business metrics
- Support L1: read-only — cannot take actions or impersonate

---

## Checklist Before Any PR

- [ ] No lockbox codes logged or exposed
- [ ] No service role key used in user-facing routes
- [ ] All new tables with customer data have RLS enabled
- [ ] RLS policies use `public.get_user_team_id()` — not direct `users` table queries
- [ ] All input validated with Zod schemas
- [ ] All AWS calls specify `region: 'ca-central-1'` explicitly
- [ ] All queries parameterized (no string concatenation in SQL)
- [ ] No secrets in source code
- [ ] Dependencies added with `--save-exact`
- [ ] `sanitizeRequestBody()` used in all error logging paths

---

## Full Security Policy

The complete security policy (threat model, incident response plan, PIPEDA compliance details, implementation priority, key decisions log) is maintained in `SLIM_Security_Policy.md` in the Claude project knowledge base. This manifest is the enforcement layer — the policy is the rationale layer.

---

**This document is the law. Follow it.**
