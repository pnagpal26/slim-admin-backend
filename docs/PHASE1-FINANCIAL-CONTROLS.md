# Phase 1: Financial Controls

**Status:** ✅ Complete
**Committed:** 2026-02-18
**Branch:** main

---

## Overview

Phase 1 added three financial control capabilities to the admin backend:

1. **Suspend Account** — manually lock a customer team out of the app
2. **Disputes & Chargebacks** — global view of all Stripe disputes with urgency tracking
3. **Refunds** — global view of all issued refunds with totals

It also introduced a shared `AdminNav` component, replacing 6 copies of inline navigation markup with a single component.

---

## Table of Contents

- [Shared AdminNav Component](#shared-adminnav-component)
- [Suspend Account](#suspend-account)
- [Automatic Suspension on Lost Chargeback](#automatic-suspension-on-lost-chargeback)
- [How Disputes & Refunds Enter the System](#how-disputes--refunds-enter-the-system)
- [Chargeback Reminder Cron](#chargeback-reminder-cron)
- [Email Templates](#email-templates)
- [Disputes & Chargebacks Page](#disputes--chargebacks-page)
- [Refunds Page](#refunds-page)
- [Permission Model](#permission-model)
- [Database Fields Referenced](#database-fields-referenced)
- [Audit Trail](#audit-trail)
- [Customer Billing History (Phase 1D)](#customer-billing-history-phase-1d)
- [Known Issues & Gaps](#known-issues--gaps)

---

## Shared AdminNav Component

**File:** `app/components/AdminNav.tsx`

Centralises the top navigation bar used across all admin pages. Accepts `active` (the current page key) and `role` (the authenticated admin's role string).

**Nav items and visibility:**

| Item        | Key           | Visible to          |
|-------------|---------------|---------------------|
| Dashboard   | `dashboard`   | All roles           |
| Customers   | `customers`   | All roles           |
| Disputes    | `disputes`    | All roles           |
| Refunds     | `refunds`     | All roles           |
| Alerts      | `alerts`      | All roles           |
| Errors      | `errors`      | All roles           |
| Audit Log   | `audit`       | All roles           |
| Admin Users | `admin-users` | `super_admin` only  |

Active item renders with a teal bottom border (`border-[#0D7377]`). All items use standard `<a>` tags for full-page navigation.

Pages updated to use `AdminNav`: `dashboard`, `customers`, `customers/[id]`, `alerts`, `errors`, `audit`, `admin-users`.

---

## Suspend Account

### What it does

Sets a customer team's `account_status` to `'suspended'`, immediately blocking all member logins. Records the reason and timestamp. All actions are written to the audit log.

### Login blocking

**File:** `app/api/auth/login/route.ts`

After validating credentials, the login endpoint fetches `teams.account_status` and blocks the session if it is anything other than `'active'`:

```typescript
if (team?.account_status && team.account_status !== 'active') {
  return NextResponse.json(
    { error: 'Your account has been suspended. Please contact support@getslim.app for assistance.' },
    { status: 403 }
  )
}
```

This check applies to **both** manual admin suspensions (`account_status: 'suspended'`) and automatic webhook suspensions (`account_status: 'suspended_chargeback'`). Any non-active value blocks login.

### account_status values

There are two different values written depending on which path triggers the suspension:

| Source | Value written | Who sets it |
|--------|---------------|-------------|
| Admin manual suspend (`POST /api/customers/suspend`) | `'suspended'` | Admin action |
| Automatic on lost chargeback (`charge.dispute.funds_withdrawn` webhook) | `'suspended_chargeback'` | Stripe webhook |

The re-enable route always writes `'active'` regardless of which suspension path was used.

### Stripe subscription on manual suspend

**The admin manual suspend endpoint does NOT cancel or modify the Stripe subscription.** It only updates the local `teams` table. If the subscription should also be cancelled, that must be done manually in the Stripe Dashboard.

By contrast, the automatic suspension triggered by a lost chargeback (`handleDisputeFundsWithdrawn`) **does** set `cancel_at_period_end: true` on the Stripe subscription. See [Automatic Suspension on Lost Chargeback](#automatic-suspension-on-lost-chargeback) for the full sequence.

### UI entry point

**File:** `app/customers/[id]/page.tsx`

- A **"Suspend Account"** button appears in the page header, visible only when:
  - `account.account_status === 'active'` (account is not already suspended)
  - `canEdit` is true (admin role is `super_admin` or `support_l2`)
- The button styling uses muted red (`bg-red-600/40`) to signal a destructive action without being alarming on a normal page view.
- When the account is suspended, the button disappears and the **Suspension Alert banner** (red box at top of main content) appears.

### Modal fields

| Field  | Type     | Required | Values |
|--------|----------|----------|--------|
| Reason | dropdown | Yes      | Chargeback, Fraud, Abuse / Policy Violation, Non-Payment, Other |
| Notes  | textarea | No       | Free text (appended to reason in DB) |

The stored `suspended_reason` string is composed as:
- Notes absent: `"Fraud"` (the reason label)
- Notes present: `"Fraud: customer disputed two charges and filed a police report"` (label + `: ` + notes)

### API endpoint

**Route:** `POST /api/customers/suspend`
**File:** `app/api/customers/suspend/route.ts`
**Permission:** `edit_customer` (`super_admin` or `support_l2`)

**Request body:**
```json
{
  "teamId": "uuid",
  "reason": "fraud",
  "notes": "optional free text"
}
```

**Valid reason keys:** `chargeback`, `fraud`, `abuse`, `non_payment`, `other`

**Guards (returns 400 if violated):**
- `teamId` and `reason` are required
- `reason` must be one of the 5 valid keys
- Team must exist (404 if not found)
- `account_status` must currently be `'active'` — cannot suspend an already-suspended account

**Database writes (on `teams` table):**
```
account_status:          'suspended'
suspended_at:            ISO timestamp
suspended_reason:        "<reason label>: <notes>" or just "<reason label>"
suspended_by_admin_id:   admin.adminId
updated_at:              ISO timestamp
```

**Response:** `{ success: true }`

### Re-enabling a suspended account

The "Re-enable Account" button appears inside the Suspension Alert banner when `account_status !== 'active'` and `canReEnable` is true (`super_admin` or `support_l2`). It calls `POST /api/customers/re-enable`, which sets `account_status` back to `'active'` and logs the action.

### Optimistic UI update

After a successful suspend call, the frontend immediately sets `account.account_status` to `suspended_${reason}` locally (e.g. `suspended_fraud`) and populates `suspended_at`. This makes the banner appear and the button disappear without a page reload. Note: the actual DB value is `'suspended'` — the local state differs until the next page load. See [Known Issues & Gaps](#known-issues--gaps).

---

## Automatic Suspension on Lost Chargeback

**File:** `app/api/stripe/webhook-handlers/disputes.ts` — `handleDisputeFundsWithdrawn()`

When Stripe sends a `charge.dispute.funds_withdrawn` event (meaning the bank ruled against SLIM and funds were pulled), the webhook handler runs the following sequence automatically with no admin action required:

1. **Suspend the account** — sets `account_status: 'suspended_chargeback'` plus `suspended_at`, `suspended_reason`, `suspended_by_admin_id: 'system'`, and `suspended_metadata` (dispute ID, amount, reason) on the `teams` row.

2. **Cancel the Stripe subscription** — calls `stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })`. The subscription stays active until the current billing period ends, then cancels automatically.

3. **Email all admins** — sends `admin_chargeback_lost` template to every active admin.

4. **Email the customer** — sends `customer_account_suspended` template to the team leader.

5. **Race condition check** — logs a warning if a refund was also issued on the same charge (simultaneous refund + dispute scenario).

This means a lost chargeback triggers a full account lockout, subscription cancellation, and notifications without any manual step. The admin backend's Disputes page and customer detail page will reflect the suspension on next load.

---

## How Disputes & Refunds Enter the System

Records in the `disputes` and `refunds` tables are created **automatically** by the Stripe webhook handler. There is no manual data entry.

**Webhook handler:** `app/api/stripe/webhook/route.ts`

**Events handled that relate to financial controls:**

| Stripe event | Handler | Action |
|---|---|---|
| `charge.dispute.created` | `handleDisputeCreated` | Inserts row into `disputes`; emails admins (`admin_chargeback_created`) |
| `charge.dispute.updated` | `handleDisputeUpdated` | Updates existing `disputes` row status |
| `charge.dispute.funds_withdrawn` | `handleDisputeFundsWithdrawn` | Suspends account, cancels subscription, sends emails (see above) |
| `charge.dispute.funds_reinstated` | `handleDisputeFundsReinstated` | Updates dispute row; account re-enable must be done manually |
| `charge.dispute.closed` | `handleDisputeClosed` | Updates dispute row status |
| `charge.refunded` | `handleChargeRefunded` | Inserts row into `refunds`; emails admins (`admin_refund_issued`) |

**Dispute insert** (on `charge.dispute.created`):
```typescript
supabase.from('disputes').insert({
  team_id,
  stripe_dispute_id: dispute.id,
  stripe_charge_id: dispute.charge,
  amount: dispute.amount,
  currency: dispute.currency,
  reason: dispute.reason,
  status: dispute.status,
  evidence_due_by: dispute.evidence_details?.due_by
    ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
    : null,
  stripe_metadata: dispute,
})
```

**Refund insert** (on `charge.refunded`):
```typescript
supabase.from('refunds').insert({
  team_id,
  stripe_refund_id: refund.id,
  stripe_charge_id: charge.id,
  amount_refunded: refund.amount,
  currency: refund.currency,
  reason: refund.reason || 'unknown',
  status: refund.status || 'succeeded',
  stripe_metadata: refund,
})
```

The `team_id` is resolved by looking up `stripe_customers.team_id` using the Stripe customer ID on the charge.

---

## Chargeback Reminder Cron

**Route:** `GET /api/cron/chargeback-reminders`
**File:** `app/api/cron/chargeback-reminders/route.ts`
**Schedule:** Daily at **09:00 UTC** (`0 9 * * *` in `vercel.json`)

Queries disputes where `status IN ('needs_response', 'warning_needs_response')` and `evidence_due_by` is set. For each, checks whether the deadline falls within a reminder window and sends an email if the corresponding column is still `null` (not yet sent).

**Reminder windows and columns updated:**

| Window | Condition | Column set |
|--------|-----------|------------|
| 48h reminder | 46–50 hours before deadline | `reminder_48hr_sent_at` |
| 24h reminder | 22–26 hours before deadline | `reminder_24hr_sent_at` |
| 6h reminder | 4–8 hours before deadline | `reminder_6hr_sent_at` |

Each reminder sends the `admin_chargeback_reminder_48hr` / `_24hr` / `_6hr` template to all active admins. The timestamp is written to prevent re-sending on subsequent cron runs.

The Disputes page shows green/gray chips (48h / 24h / 6h) per row reflecting these columns.

---

## Email Templates

**File:** `lib/email-templates.ts`

All templates related to financial controls exist in the codebase:

| Template key | Sent when | Recipients |
|---|---|---|
| `admin_chargeback_created` | `charge.dispute.created` webhook fires | All active admins |
| `admin_chargeback_reminder_48hr` | Cron: 46–50h before evidence deadline | All active admins |
| `admin_chargeback_reminder_24hr` | Cron: 22–26h before evidence deadline | All active admins |
| `admin_chargeback_reminder_6hr` | Cron: 4–8h before evidence deadline | All active admins |
| `admin_chargeback_won` | `charge.dispute.closed` (won outcome) | All active admins |
| `admin_chargeback_lost` | `charge.dispute.funds_withdrawn` webhook fires | All active admins |
| `admin_refund_issued` | `charge.refunded` webhook fires | All active admins |
| `customer_account_suspended` | `charge.dispute.funds_withdrawn` webhook fires | Team leader |

There is **no** `customer_account_suspended` email sent for manual admin suspensions — only for automatic webhook suspensions on lost chargebacks.

---

## Disputes & Chargebacks Page

**Route:** `/disputes`
**File:** `app/disputes/page.tsx`

Displays all Stripe disputes in the system. Rows are ordered by urgency (most urgent at top) and clickable to navigate to the relevant customer detail page.

**Key UI elements:**

- **Urgency alert bar** — shown when any dispute has an evidence deadline within 48 hours. Displays count and a plain-language warning that missed deadlines result in automatic loss.
- **Action-needed subtitle** — below the page title, shows how many disputes need a response and how many are urgent.
- **Status filter tabs** — All / Needs Response / Under Review / Won / Lost. Selecting a tab re-fetches filtered results from the API. Tab badges show counts from the current summary.
- **Color-coded rows** — row background reflects urgency:
  - Red (`bg-red-50`) — Critical: evidence due in < 24h
  - Orange (`bg-orange-50`) — Urgent: evidence due in < 48h
  - Yellow (`bg-yellow-50/50`) — Warning: evidence due in < 7 days
  - No highlight — Normal
- **Reminder badges** — three small chips per row (48h / 24h / 6h) that turn green when the corresponding cron reminder was sent.
- **Evidence deadline column** — shows date + time remaining, coloured to match urgency.

### API endpoint

**Route:** `GET /api/disputes/list`
**File:** `app/api/disputes/list/route.ts`
**Permission:** `view_customer_detail` (all roles)

**Query params:**

| Param     | Description                              | Default |
|-----------|------------------------------------------|---------|
| `status`  | Filter by Stripe dispute status          | all     |
| `team_id` | Filter to a single customer (for detail page use) | all |

**Valid status values:** `warning_needs_response`, `warning_under_review`, `warning_closed`, `needs_response`, `under_review`, `prevented`, `won`, `lost`

**Ordering:** `evidence_due_by ASC NULLS LAST`, then `created_at DESC`. Most urgent deadlines appear first; disputes without deadlines go to the bottom.

**Urgency calculation (server-side):**

Computed from `hours_remaining = (evidence_due_by - now) / 3600`:

| Urgency    | Condition              |
|------------|------------------------|
| `critical` | < 24 hours remaining   |
| `urgent`   | < 48 hours remaining   |
| `warning`  | < 7 days remaining     |
| `normal`   | 7+ days or no deadline |

Past deadlines (`hours_remaining < 0`) are treated as `normal` urgency (already expired).

**Summary block returned:**
```json
{
  "total": 12,
  "action_needed": 3,
  "urgent": 1,
  "by_status": {
    "needs_response": 2,
    "warning_needs_response": 1,
    "under_review": 4,
    "won": 5
  }
}
```

`action_needed` = count of `needs_response` + `warning_needs_response` statuses.
`urgent` = count of `critical` + `urgent` urgency items.

**Stripe dispute status mapping to UI labels:**

| DB status                  | Displayed as     | Color  |
|----------------------------|------------------|--------|
| `needs_response`           | Needs Response   | Red    |
| `warning_needs_response`   | Needs Response   | Red    |
| `under_review`             | Under Review     | Yellow |
| `warning_under_review`     | Under Review     | Yellow |
| `warning_closed`           | Closed           | Gray   |
| `prevented`                | Prevented        | Blue   |
| `won`                      | Won              | Green  |
| `lost`                     | Lost             | Gray   |

Stripe prefixes `warning_` on early fraud warning (EFW) disputes — the UI merges these with their non-warning equivalents for display.

---

## Refunds Page

**Route:** `/refunds`
**File:** `app/refunds/page.tsx`

Lists all Stripe refunds. Rows click through to the customer detail page.

**Key UI elements:**

- **Total refunded** — subtitle below page title shows the total amount (in USD) across all `succeeded` refunds for the current filter.
- **Status filter tabs** — All / Succeeded / Pending / Failed / Canceled. Re-fetches on selection.
- **Refund ID column** — shows the Stripe `re_...` ID in monospace for reference when looking up in Stripe Dashboard.

### API endpoint

**Route:** `GET /api/refunds/list`
**File:** `app/api/refunds/list/route.ts`
**Permission:** `view_customer_detail` (all roles)

**Query params:**

| Param     | Description                              | Default |
|-----------|------------------------------------------|---------|
| `status`  | Filter by refund status                  | all     |
| `team_id` | Filter to a single customer (for detail page use) | all |

**Valid status values:** `pending`, `succeeded`, `failed`, `canceled`

**Ordering:** `created_at DESC` (newest first). No urgency computation — refunds are not time-sensitive.

**Summary block returned:**
```json
{
  "total": 8,
  "total_amount_succeeded": 24900,
  "by_status": {
    "succeeded": 6,
    "failed": 1,
    "pending": 1
  }
}
```

`total_amount_succeeded` is in cents. Divide by 100 for display (handled by `formatCents()` in the page component).

**Stripe refund reason labels:**

| DB reason                  | Displayed as      |
|----------------------------|-------------------|
| `duplicate`                | Duplicate         |
| `fraudulent`               | Fraudulent        |
| `requested_by_customer`    | Customer Request  |
| `expired_uncaptured_charge`| Uncaptured Charge |
| `unknown`                  | Unknown           |
| *(null)*                   | —                 |

---

## Permission Model

| Action                         | Roles                          |
|--------------------------------|--------------------------------|
| View Disputes page             | All (`super_admin`, `support_l2`, `support_l1`) |
| View Refunds page              | All                            |
| View Suspend button            | `super_admin`, `support_l2`    |
| Execute Suspend                | `super_admin`, `support_l2`    |
| View Admin Users nav item      | `super_admin` only             |

The API enforces permissions via `requireRole()`. The UI hides buttons based on `adminRole` from `/api/auth/me`, but the API is the authoritative enforcement layer.

---

## Database Fields Referenced

### `teams` table — suspension fields

| Column                    | Type        | Manual suspend | Webhook auto-suspend | Re-enable |
|---------------------------|-------------|----------------|----------------------|-----------|
| `account_status`          | text        | `'suspended'`  | `'suspended_chargeback'` | `'active'` |
| `suspended_at`            | timestamptz | now()          | now()                | —         |
| `suspended_reason`        | text        | reason + notes | `"Lost chargeback dispute <id>"` | — |
| `suspended_by_admin_id`   | uuid/text   | admin UUID     | `'system'`           | —         |
| `suspended_metadata`      | jsonb       | —              | `{ dispute_id, dispute_amount, dispute_reason }` | — |
| `re_enabled_at`           | timestamptz | —              | —                    | now()     |
| `re_enabled_by`           | text        | —              | —                    | admin email |

### `disputes` table

| Column                    | Type        | Notes                                          |
|---------------------------|-------------|------------------------------------------------|
| `stripe_dispute_id`       | text        | Stripe `dp_...` ID                             |
| `stripe_charge_id`        | text        | Stripe `ch_...` ID                             |
| `team_id`                 | uuid        | FK to `teams`                                  |
| `amount`                  | integer     | Disputed amount in cents                       |
| `currency`                | text        | e.g. `usd`                                     |
| `reason`                  | text        | Stripe reason code (see label table above)     |
| `status`                  | text        | Stripe dispute status                          |
| `evidence_due_by`         | timestamptz | Deadline to submit evidence; null if no deadline |
| `reminder_48hr_sent_at`   | timestamptz | Set by cron when 48h reminder email sent       |
| `reminder_24hr_sent_at`   | timestamptz | Set by cron when 24h reminder email sent       |
| `reminder_6hr_sent_at`    | timestamptz | Set by cron when 6h reminder email sent        |
| `resolved_at`             | timestamptz | When dispute was resolved                      |
| `resolution_outcome`      | text        | `won` / `lost` / etc.                          |
| `stripe_metadata`         | jsonb       | Raw Stripe dispute object                      |

### `refunds` table

| Column                     | Type        | Notes                              |
|----------------------------|-------------|------------------------------------|
| `stripe_refund_id`         | text        | Stripe `re_...` ID                 |
| `stripe_charge_id`         | text        | Stripe `ch_...` ID                 |
| `team_id`                  | uuid        | FK to `teams`                      |
| `amount_refunded`          | integer     | Amount in cents                    |
| `currency`                 | text        | e.g. `usd`                         |
| `reason`                   | text        | Stripe reason code or `'unknown'`  |
| `status`                   | text        | `pending`, `succeeded`, `failed`, `canceled` |
| `stripe_metadata`          | jsonb       | Raw Stripe refund object           |

> **Note:** Both `disputes` and `refunds` have RLS enabled but **no RLS policies** — they are accessible only via the service-role key (used by the admin backend). See `SECURITY_MANIFEST.md` for details.

---

## Audit Trail

The manual suspend action writes a record to `admin_actions`:

```json
{
  "action":         "suspend_account",
  "target_team_id": "<teamId>",
  "details": {
    "team_name":     "Acme Realty",
    "reason_key":    "fraud",
    "reason_label":  "Fraud",
    "notes":         "Two chargebacks in 30 days"
  }
}
```

Automatic webhook suspensions are not written to `admin_actions` (they use `suspended_by_admin_id: 'system'` on the teams row instead). Re-enable actions are logged under `re_enable_account`.

Disputes and Refunds pages are read-only — no admin actions are taken from them directly. They navigate to the customer detail page for follow-up actions.

---

## Customer Billing History (Phase 1D)

**Status:** ✅ Complete
**Committed:** 2026-02-18

### What it does

Adds a **Billing History** section to the customer detail page (`/customers/[id]`) showing that customer's disputes and refunds in context, without leaving the page. Placed between Email History and Activity Timeline.

### Data fetching

Both requests are added to the existing `Promise.all` on page load — no extra round trip:

```typescript
fetch(`/api/disputes/list?team_id=${teamId}`)
fetch(`/api/refunds/list?team_id=${teamId}`)
```

Disputes are re-sorted client-side by `created_at DESC` after fetch, because the API returns them urgency-first (for the global disputes page). Refunds arrive already sorted newest-first from the API.

### Disputes subsection

**Summary line:** `{n} disputes · {n} needs response` — the "needs response" part only renders if `action_needed > 0`, and is styled red.

**Table columns:** Amount · Reason · Status · Evidence Due · Date · Stripe link

- **Status badges** use the same color config as the global disputes page (red = needs response, yellow = under review, green = won, gray = lost/closed/prevented)
- **Urgency row colors** — row background tinted based on evidence deadline proximity:
  - `bg-red-50` — critical (< 24h)
  - `bg-orange-50` — urgent (< 48h)
  - `bg-yellow-50/50` — warning (< 7 days)
  - no tint — normal
- **Evidence Due** shows date + time remaining: `"Dec 15 (3d left)"` / `"Dec 15 (4h left)"` / `"Dec 15 (past)"`; `—` if no deadline
- **Stripe link** — ↗ icon, opens `https://dashboard.stripe.com/disputes/{stripe_dispute_id}` in new tab

**Empty state:** `"No disputes or chargebacks"`

### Refunds subsection

**Summary line:** `{n} refunds · $XX.XX refunded` — the amount reflects `total_amount_succeeded` only (succeeded refunds), labeled "refunded" to make clear failed/pending amounts are excluded.

**Table columns:** Amount · Reason · Status · Date · Stripe link

- **Status badges:** green = succeeded, yellow = pending, red = failed, gray = canceled
- **Stripe link** — ↗ icon, opens `https://dashboard.stripe.com/payments/{stripe_charge_id}` in new tab. Stripe doesn't have a direct `/refunds/{id}` page — refunds are viewed through the parent payment.

**Empty state:** `"No refunds issued"`

### Won dispute + suspended account warning

When any dispute has `status === 'won'` **and** `account.account_status !== 'active'`, an amber warning banner renders above the disputes table:

> A dispute was won but this account remains suspended. Use the **Re-enable Account** button above to restore access.

The condition uses `!== 'active'` (not `=== 'suspended_chargeback'`) to cover both manual suspensions (`'suspended'`) and automatic webhook suspensions (`'suspended_chargeback'`).

### Stripe Dashboard URL notes

| Link type | URL format | Notes |
|---|---|---|
| Dispute | `dashboard.stripe.com/disputes/{stripe_dispute_id}` | Direct page |
| Refund | `dashboard.stripe.com/payments/{stripe_charge_id}` | Via parent charge — Stripe has no standalone refund URL |

Both use `target="_blank" rel="noopener noreferrer"`.

In test mode, Stripe Dashboard URLs use `/test/` prefix — these links will work in live mode only.

---

## Known Issues & Gaps

### Optimistic UI value mismatch on suspend

After a successful manual suspend, the frontend sets `account.account_status` to `suspended_${reason}` locally (e.g. `suspended_fraud`). The actual DB value is `'suspended'`. The Suspension Alert banner checks for specific values like `suspended_chargeback`, `suspended_fraud`, etc. to show reason text — these won't match on a page reload after a manual suspend, so the reason line in the banner will be blank until the detail page is refactored to handle the plain `'suspended'` value.

### No customer email on manual suspend

`customer_account_suspended` is only sent by the automatic webhook flow. If an admin manually suspends an account, no email goes to the customer — it must be sent manually or from the Resend dashboard.

### No Stripe cancellation on manual suspend

Manual admin suspend does not touch Stripe. If the intent is to also stop billing, the subscription must be cancelled separately in the Stripe Dashboard.

### funds_reinstated does not auto-re-enable

When Stripe sends `charge.dispute.funds_reinstated` (dispute won), the webhook updates the dispute row but does **not** automatically re-enable the account. An admin must re-enable the account manually from the customer detail page. The Billing History section surfaces this with the amber warning prompt.
