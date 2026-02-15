# Email Bounce Tracking - Testing Checklist

**Tester:** _____________
**Date:** _____________
**Environment:** [ ] Local [ ] Staging [ ] Production

---

## Pre-Test Setup

- [ ] Admin backend running: `npm run dev`
- [ ] Test data created: `npx tsx scripts/create-test-bounces-for-admin.ts`
- [ ] Browser: Chrome/Firefox/Safari
- [ ] DevTools open (for console/network monitoring)
- [ ] Admin credentials ready

---

## Test 1: Dashboard Card

**URL:** http://localhost:3001/dashboard

### Visual Checks
- [ ] Card displays in "Financial Health" section (4th card)
- [ ] Icon shows: 📧
- [ ] Title reads: "Email Delivery Issues"
- [ ] Large number displays total bounces
- [ ] Breakdown shows: "X critical, Y billing"

### Expected Values
- [ ] Total: 1
- [ ] Critical: 0
- [ ] Billing: 1
- [ ] Color: Gray/White (normal state)

### Edge Cases
- [ ] If critical > 5: Card turns orange
- [ ] If total = 0: Shows "No bounces in 24h"

**Status:** [ ] ✅ Pass [ ] ❌ Fail

**Notes:**
```



```

---

## Test 2: Customers List - Column

**URL:** http://localhost:3001/customers

### Visual Checks
- [ ] "Bounces" column appears after "Last Login"
- [ ] Column header is clickable
- [ ] Tooltip shows on hover: "Bounced emails in last 30 days"
- [ ] All customers display bounce counts or "—"

### Badge Color Validation

| Customer | Expected Count | Expected Color | Actual | ✓/✗ |
|----------|----------------|----------------|--------|-----|
| Puneet Nagpal | 10 | Orange ⚠️ | ___ | [ ] |
| Indiver N | 6 | Orange ⚠️ | ___ | [ ] |
| Mera Naam Joker | 3 | Yellow | ___ | [ ] |
| The Nagpal Group | 2 | Yellow | ___ | [ ] |
| Paul Freetrial | 0 | — (dash) | ___ | [ ] |

**Status:** [ ] ✅ Pass [ ] ❌ Fail

**Notes:**
```



```

---

## Test 3: Customers List - Sorting

**URL:** http://localhost:3001/customers

### First Click (Descending)
- [ ] Click "Bounces" column header
- [ ] Arrow shows ↓
- [ ] Order: 10, 6, 3, 2, 0

**Actual order:** ___________________________________

### Second Click (Ascending)
- [ ] Click "Bounces" column header again
- [ ] Arrow shows ↑
- [ ] Order: 0, 2, 3, 6, 10

**Actual order:** ___________________________________

### Page Behavior
- [ ] No full page reload
- [ ] URL updates with sort params
- [ ] Other columns remain in sync

**Status:** [ ] ✅ Pass [ ] ❌ Fail

**Notes:**
```



```

---

## Test 4: Customer Detail - WITH Bounces

**URL:** http://localhost:3001/customers/[click Puneet Nagpal]

### Section Display
- [ ] "Email Delivery History" section appears
- [ ] Section is below "Team Members"
- [ ] Section is above "Recent Activity"

### Summary Banner
- [ ] Orange/yellow background
- [ ] ⚠️ warning icon
- [ ] Text: "X emails bounced in last 30 days"
- [ ] Bounce rate percentage shown
- [ ] Pattern detection (if applicable)

**Expected:** "10 emails bounced in last 30 days (X% bounce rate)"

**Actual:**
```



```

### Table Display
- [ ] Table has 4 columns: Type, Recipient, Subject, Sent Date
- [ ] All 10 bounces displayed
- [ ] Sorted by date (newest first)

### Badge Colors (sample 3 rows)

| Template Key | Expected Color | Actual | ✓/✗ |
|--------------|----------------|--------|-----|
| password_reset | 🔴 Red "Security" | ___ | [ ] |
| payment_failed | 🟡 Yellow "Billing" | ___ | [ ] |
| team_invite | 🔴 Red "Security" | ___ | [ ] |

**Status:** [ ] ✅ Pass [ ] ❌ Fail

**Notes:**
```



```

---

## Test 5: Customer Detail - NO Bounces

**URL:** http://localhost:3001/customers/[click Paul Freetrial]

### Validation
- [ ] "Email Delivery History" section does NOT appear
- [ ] No errors in console
- [ ] Other sections display normally
- [ ] Account Info section: ✓
- [ ] Usage Summary section: ✓
- [ ] Team Members section: ✓
- [ ] Recent Activity section: ✓

**Status:** [ ] ✅ Pass [ ] ❌ Fail

**Notes:**
```



```

---

## Test 6: API Responses

**Use DevTools Network Tab**

### Dashboard API
**URL:** `/api/dashboard/email-bounces`

- [ ] Status: 200 OK
- [ ] Response time: < 500ms
- [ ] Response contains:
  - [ ] `total_24h` (number)
  - [ ] `critical_24h` (number)
  - [ ] `billing_24h` (number)
  - [ ] `teams_affected` (number)

**Actual response time:** _______ ms

### Customers List API
**URL:** `/api/customers/list`

- [ ] Status: 200 OK
- [ ] Response time: < 1000ms
- [ ] Each customer has `bounce_count` field
- [ ] Bounce counts match visual display

**Actual response time:** _______ ms

### Customer Detail API
**URL:** `/api/customers/bounced-emails?team_id=...`

- [ ] Status: 200 OK
- [ ] Response time: < 500ms
- [ ] Response contains:
  - [ ] `bounces` (array)
  - [ ] `summary` (object)
  - [ ] `summary.bounced_count` (number)
  - [ ] `summary.bounce_rate` (number)
  - [ ] `summary.problematic_emails` (array)

**Actual response time:** _______ ms

**Status:** [ ] ✅ Pass [ ] ❌ Fail

---

## Test 7: Edge Cases

### Empty State
- [ ] Customer with 0 bounces: Section hidden ✓
- [ ] Dashboard with 0 bounces: Shows "No bounces in 24h" ✓

### Large Numbers
- [ ] Customer with >50 bounces: Shows "Showing 50 most recent" ✓
- [ ] Dashboard with >100 bounces: Number formats correctly (100+) ✓

### Mobile Responsive (if applicable)
- [ ] Dashboard card stacks properly ✓
- [ ] Customers table scrolls horizontally ✓
- [ ] Bounce badges remain readable ✓

**Status:** [ ] ✅ Pass [ ] ❌ Fail

---

## Test 8: Console & Errors

### Browser Console
- [ ] No errors in console
- [ ] No warnings (or expected warnings only)
- [ ] No failed API calls

**Errors found:**
```



```

### Network Tab
- [ ] All API calls succeed (200)
- [ ] No 404s or 500s
- [ ] Response times acceptable

**Issues found:**
```



```

**Status:** [ ] ✅ Pass [ ] ❌ Fail

---

## Performance Check

### Load Times
- [ ] Dashboard loads in < 2 seconds
- [ ] Customers list loads in < 3 seconds
- [ ] Customer detail loads in < 2 seconds

**Actual times:**
- Dashboard: _______ seconds
- Customers: _______ seconds
- Detail: _______ seconds

### Interaction Speed
- [ ] Column sorting: Instant (<100ms)
- [ ] Page navigation: < 500ms
- [ ] No UI lag or jank

**Status:** [ ] ✅ Pass [ ] ❌ Fail

---

## Browser Compatibility

Test in multiple browsers:

| Browser | Version | Dashboard | Customers | Detail | Status |
|---------|---------|-----------|-----------|--------|--------|
| Chrome | ___ | [ ] | [ ] | [ ] | [ ] Pass |
| Firefox | ___ | [ ] | [ ] | [ ] | [ ] Pass |
| Safari | ___ | [ ] | [ ] | [ ] | [ ] Pass |
| Edge | ___ | [ ] | [ ] | [ ] | [ ] Pass |

---

## Final Summary

### Total Tests
- **Passed:** _____ / 8
- **Failed:** _____ / 8
- **Blocked:** _____ / 8

### Critical Issues
```



```

### Minor Issues
```



```

### Recommendations
```



```

---

## Sign-off

**Tester Signature:** _______________________

**Date:** _____________

**Overall Status:** [ ] ✅ Approved for Production [ ] ❌ Needs Fixes [ ] ⚠️ Approved with Notes

---

## Next Steps

If all tests pass:
- [ ] Update documentation with any findings
- [ ] Create deployment ticket
- [ ] Notify stakeholders
- [ ] Schedule production deployment

If tests fail:
- [ ] Create bug tickets for each issue
- [ ] Prioritize fixes
- [ ] Retest after fixes
- [ ] Update this checklist
