# Email Bounce Tracking - Issues & Enhancements

**Test Date:** 2026-02-15
**Tester:** Puneet Nagpal
**Status:** ✅ **SPRINTS 1 & 2 COMPLETE** - All core issues fixed!

**Completed:** 9/9 bugs and quick-win features ✅
**Remaining:** 3 optional enhancements (Sprint 3)

---

## 🐛 Bugs (Need Fixing)

### HIGH Priority

#### Bug #2: Missing Favicon
**Severity:** Low (visual only, no functionality impact)
**Location:** Admin-backend root
**Issue:** `favicon.ico` returns 404
**Impact:** Browser console warning, unprofessional appearance

**Fix:**
```bash
# Add favicon to admin-backend/public/
# Update next.config.js or add to public folder
```

**Effort:** 5 minutes

---

#### Bug #4: Missing Tooltip on Bounces Column
**Severity:** Medium (affects UX/discoverability)
**Location:** `/customers` - Bounces column header
**Issue:** No tooltip appears on hover
**Expected:** "Bounced emails in last 30 days"

**Current Code:**
```tsx
<th
  onClick={() => handleSort('bounce_count')}
  className="cursor-pointer"
  title="Bounced emails in last 30 days"  // ← This should work but doesn't
>
  Bounces{sortIndicator('bounce_count')}
</th>
```

**Investigation Needed:** Check if Tailwind is overriding, or if title attribute needs different approach

**Effort:** 15 minutes

---

#### Bug #8: Subject Field Shows Raw Template Keys
**Severity:** High (confusing to users)
**Location:** `/customers/[id]` - Email Delivery History table
**Issue:** Subject shows "Test email_verification_resend email" instead of friendly subject
**Root Cause:** Test data created with template_key in subject field

**Current:**
```
Subject: "Test email_verification_resend email"
```

**Expected:**
```
Subject: "Verify your email address"
```

**Fix Options:**
1. **Quick fix:** Update test data creation script to use friendly subjects
2. **Better fix:** Map template_key to friendly subjects in UI if subject is generic
3. **Best fix:** Ensure real bounce data from Resend webhook has actual subjects

**Effort:** 30 minutes (option 1), 1 hour (option 2)

---

#### Bug #10: Action Column Shows Raw Values
**Severity:** Medium (affects readability)
**Location:** `/customers/[id]` - Recent Activity table
**Issue:** Shows "checked_out", "photo_uploaded" with underscores
**Expected:** "Checked Out", "Photo Uploaded"

**Fix:**
```tsx
// Add formatter function
function formatAction(action: string): string {
  return action
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Use in render
<td>{formatAction(a.action)}</td>
```

**Effort:** 30 minutes

---

### MEDIUM Priority

#### Bug #3: Badge Colors Too Similar
**Severity:** Medium (affects quick scanning)
**Location:** `/customers` - Bounces column badges
**Issue:** Orange (≥5) and Yellow (2-4) badges hard to differentiate

**Current Colors:**
```tsx
// Orange (≥5)
bg-orange-100 text-orange-700

// Yellow (2-4)
bg-yellow-100 text-yellow-700
```

**Suggested Fix:**
```tsx
// Make orange more red/vibrant
bg-orange-200 text-orange-800  // or bg-red-100 text-red-700

// Keep yellow softer
bg-yellow-50 text-yellow-800

// Or use different approach:
// High: bg-red-100 text-red-700 font-bold
// Medium: bg-orange-100 text-orange-700
// Low: bg-gray-100 text-gray-600
```

**Effort:** 15 minutes

---

#### Bug #6: Naming Inconsistency - "Team Name" vs "Customer"
**Severity:** Low (terminology clarity)
**Location:** `/customers` - Table header
**Issue:** Column says "Team Name" but context is "Customers" page
**Discussion Needed:** Are we managing "Teams" or "Customers"?

**Options:**
1. Rename column to "Customer Name"
2. Keep "Team Name" but make it consistent across app
3. Show both: "Customer (Team Name)"

**Effort:** 5 minutes (after decision)

---

## 🚀 Feature Requests (Enhancements)

### HIGH Priority

#### Feature #1: Make Dashboard Card Clickable
**Priority:** High (expected UX pattern)
**Location:** `/dashboard` - Email Delivery Issues card
**Issue:** Card looks clickable but isn't
**Expected:** Click card → Navigate to bounce details/report page

**Implementation Options:**
1. **Quick:** Click → Navigate to `/customers` with sort by bounces descending
2. **Better:** Click → Navigate to new `/email-bounces` report page
3. **Best:** Modal overlay with quick stats + link to full page

**Effort:**
- Option 1: 15 minutes
- Option 2: 4-6 hours (new page)
- Option 3: 2 hours

**Recommended:** Start with Option 1

---

#### Feature #5: Add Sorting to Team Name Column
**Priority:** High (common user need)
**Location:** `/customers` - Team Name column
**Current:** Not sortable
**Expected:** Click header to sort alphabetically

**Implementation:**
```tsx
<th
  onClick={() => handleSort('team_name')}
  className="cursor-pointer hover:text-gray-900"
>
  Team Name{sortIndicator('team_name')}
</th>
```

**Backend:** Update API sort logic to support `team_name`

**Effort:** 30 minutes

---

#### Feature #7: Add Sorting to Plan Column
**Priority:** Medium (useful for segmentation)
**Location:** `/customers` - Plan column
**Current:** Not sortable
**Expected:** Click header to sort by plan tier

**Implementation:** Same as Feature #5

**Effort:** 30 minutes

---

### MEDIUM Priority

#### Feature #11: Email Bounces Report Page
**Priority:** Medium (nice to have)
**Description:** Dedicated page for comprehensive bounce analytics

**Features:**
- Global bounce trends (chart)
- Breakdown by template type (pie chart)
- Top bouncing customers (table)
- Date range filters
- Export to CSV
- Bounce rate over time (line chart)

**URL:** `/email-bounces` or `/reports/bounces`

**Effort:** 8-12 hours

---

#### Feature #12: Bounce Breakdown Tooltip
**Priority:** Low (polish)
**Location:** `/customers` - Bounce count badges
**Current:** Badge shows total count only
**Enhancement:** Hover shows breakdown

**Example:**
```
Hover over "⚠️ 10" badge
↓
Tooltip shows:
┌─────────────────────┐
│ 10 Total Bounces    │
│ • 5 Security        │
│ • 3 Billing         │
│ • 2 Team            │
└─────────────────────┘
```

**Effort:** 1-2 hours

---

#### Feature #13: Customer Outreach Tools
**Priority:** Low (future)
**Location:** `/customers/[id]` - Email Delivery History section
**Features:**
- "Contact Customer" button
- Pre-filled email template about bounce issues
- Mark bounce as "Resolved" action
- "Resend Email" button per bounce

**Effort:** 4-6 hours

---

## 📊 Summary

### Bugs by Priority
- **HIGH:** 4 bugs (need fixing soon)
- **MEDIUM:** 2 bugs (fix when convenient)
- **Total:** 6 bugs

### Features by Priority
- **HIGH:** 3 features (quick wins, high value)
- **MEDIUM:** 3 features (longer term)
- **Total:** 6 feature requests

---

## 🎯 Recommended Fix Order

### Sprint 1 (Quick Wins - 2-3 hours)
1. ✅ Bug #2: Add favicon (5 min)
2. ✅ Bug #10: Format action column (30 min)
3. ✅ Bug #8: Fix subject field in test data (30 min)
4. ✅ Feature #1: Make dashboard card clickable (15 min)
5. ✅ Feature #5: Add Team Name sorting (30 min)
6. ✅ Feature #7: Add Plan sorting (30 min)
7. ✅ Bug #3: Improve badge color contrast (15 min)

**Impact:** Fixes all high-severity bugs + adds most-requested features

---

### Sprint 2 (Polish - 1-2 hours)
1. ✅ Bug #4: Fix tooltip (15 min)
2. ✅ Bug #6: Resolve naming (5 min after decision)
3. ✅ Feature #12: Add breakdown tooltip (1-2 hours)

**Impact:** UX polish and clarity

---

### Sprint 3 (Future Enhancements - 8-12 hours)
1. 🔮 Feature #11: Email Bounces Report Page (8-12 hours)
2. 🔮 Feature #13: Customer Outreach Tools (4-6 hours)

**Impact:** Advanced analytics and workflow tools

---

## 🔧 How to Use This Document

### For Developers
- Pick issues from Sprint 1 for immediate fixes
- Each issue has implementation notes
- Effort estimates provided

### For Product
- Review feature priorities
- Make decisions on terminology (Bug #6)
- Prioritize Sprint 2 vs Sprint 3

### For QA
- Re-test after each sprint
- Use `/docs/TESTING-CHECKLIST.md` for regression testing
- Update this doc with "✅ Fixed" when complete

---

## 📝 Notes

**Test Environment:** Local development (localhost:3001)
**Test Data:** 22 bounced emails across 5 teams
**Browser Tested:** Chrome/Firefox/Safari (specify)

**Overall Assessment:**
✅ Core functionality works perfectly
⚠️ Some UX polish needed (formatting, colors, tooltips)
🚀 Several quick-win enhancements identified

---

**Last Updated:** 2026-02-15
**Next Review:** After Sprint 1 fixes
