# Today/Yesterday Date Fix Report

**Date:** 2025-01-15
**Component:** Date formatting utilities across ReplyFlow
**Bug Type:** Display semantics - Rolling 24-hour threshold vs calendar-day comparison

---

## Problem Summary

ReplyFlow was displaying "Today" for activity that occurred within the last 24 hours even when it happened on the PREVIOUS calendar day.

**Example:**
- Call occurs Friday at 10:00 AM
- User views ReplyFlow Saturday at 8:00 AM
- Only 22 hours have elapsed
- **Current:** "Today"
- **Expected:** "Yesterday"

**Root Issue:** The date formatter used elapsed time (24-hour periods) instead of calendar-day comparison.

---

## Root Cause Analysis

### Exact Formatter Responsible
- **File:** `src/components/RecentLeadsSection.tsx`
- **Functions:** 
  - `formatRelativeTime` (lines 328-339)
  - `formatFollowUpTime` (lines 341-351)

### Rolling 24-Hour Logic Used
Yes, the buggy implementation used elapsed time:
```typescript
const diffMs = now.getTime() - date.getTime()
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

if (diffDays === 0) return 'Today'
if (diffDays === 1) return 'Yesterday'
```

This calculates elapsed 24-hour periods, not calendar days.

### Other Components Audited

**Components Using Correct Calendar-Day Comparison:**
1. **CustomerActivityTimeline.tsx** (lines 435-451)
   - Uses `today.setHours(0, 0, 0, 0)` to normalize to midnight
   - Compares calendar dates correctly
   
2. **NavbarNotifications.tsx** (lines 445-473)
   - Uses `new Date(now.getFullYear(), now.getMonth(), now.getDate())` to normalize
   - Compares calendar dates correctly

**Components Using Elapsed-Time (Correct - Not Changed):**
1. **RecentWins.tsx** (lines 103-116)
   - Uses "X minutes ago", "X hours ago", "X days ago"
   - These are elapsed-time concepts, not calendar-date labels
   - Correctly left unchanged per requirements

2. **lib/utils.ts formatRelativeTime** (lines 37-53)
   - Uses "Xm ago", "Xh ago", "Xd ago"
   - These are elapsed-time concepts, not calendar-date labels
   - Correctly left unchanged per requirements

---

## Implementation

### Shared Helper Created
Added two new functions to `src/lib/utils.ts`:

#### 1. `formatCalendarRelativeDate` (lines 55-86)
Formats past dates as calendar-relative labels:
- Same local calendar date → "Today"
- Immediately previous local calendar date → "Yesterday"
- Older → Formatted date (e.g., "Aug 13", "Dec 31")

**Key Implementation:**
```typescript
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const yesterday = new Date(today)
yesterday.setDate(yesterday.getDate() - 1)
const dateNormalized = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())

if (dateNormalized.getTime() === today.getTime()) {
  return 'Today'
}
if (dateNormalized.getTime() === yesterday.getTime()) {
  return 'Yesterday'
}
```

#### 2. `formatCalendarRelativeFutureDate` (lines 88-119)
Formats future dates as calendar-relative labels:
- Same local calendar date → "Today"
- Next local calendar date → "Tomorrow"
- Future → Formatted date (e.g., "Aug 13")

### Timezone Handling
Both helpers use local timezone by:
- Using `Date.getFullYear()`, `getMonth()`, `getDate()` which return local calendar components
- Normalizing to midnight by creating dates with `new Date(year, month, day)`
- Comparing timestamps of normalized dates
- No UTC date string comparison that could cause midnight misclassification

### Files Modified

1. **src/lib/utils.ts**
   - Added `formatCalendarRelativeDate` function (32 lines)
   - Added `formatCalendarRelativeFutureDate` function (32 lines)

2. **src/components/RecentLeadsSection.tsx**
   - Imported new helpers from utils.ts
   - Replaced local `formatRelativeTime` to use `formatCalendarRelativeDate`
   - Replaced local `formatFollowUpTime` to use `formatCalendarRelativeFutureDate`

3. **src/lib/__tests__/calendar-relative-date.test.ts**
   - Created new test file with boundary tests (101 lines)

---

## Locations Fixed

### Fixed Locations
1. **RecentLeadsSection.tsx**
   - Used in "Recent Customers" section
   - Displays when customers were added
   - Now correctly shows "Today"/"Yesterday" based on calendar day

### Locations Intentionally Left Unchanged

1. **RecentActivityCard.tsx**
   - Uses `formatRelativeTime` from utils.ts
   - Displays elapsed time ("5m ago", "18h ago", "2 days ago")
   - Correct elapsed-time semantics - no change needed

2. **RecentWins.tsx**
   - Uses local `formatRelativeTime` 
   - Displays elapsed time ("X minutes ago", "X hours ago", "X days ago")
   - Correct elapsed-time semantics - no change needed

3. **CustomerActivityTimeline.tsx**
   - Already using correct calendar-day comparison
   - No change needed

4. **NavbarNotifications.tsx**
   - Already using correct calendar-day comparison
   - No change needed

---

## Boundary Tests Results

All 12 boundary tests passed:

### Past Date Tests (formatCalendarRelativeDate)
1. ✅ Same calendar day, 5 minutes ago → "Today"
2. ✅ Same calendar day, many hours ago → "Today"
3. ✅ Previous calendar day, only 2 hours ago across midnight → "Yesterday"
4. ✅ Previous calendar day, 23 hours ago → "Yesterday"
5. ✅ Two calendar days ago (< 48 elapsed hours) → Formatted date (NOT "Yesterday")
6. ✅ Month boundary → "Yesterday"
7. ✅ Year boundary → "Yesterday"
8. ✅ Null date → "N/A"

### Future Date Tests (formatCalendarRelativeFutureDate)
9. ✅ Same calendar day in future → "Today"
10. ✅ Next calendar day → "Tomorrow"
11. ✅ Future dates beyond tomorrow → Formatted date
12. ✅ Null date → "N/A"

---

## Validation Results

### TypeScript / Typecheck
✅ **Passed** (via production build)
- No type errors
- Next.js build includes type checking

### Production Build
✅ **Passed** (Next.js 15.5.21)
- Compiled successfully in 16.4s
- No build errors
- Auth page bundle: 10.8 kB (287 kB First Load JS)

### Git Diff --check
✅ **Passed** (exit code 0)
- No trailing whitespace errors in changed files
- Note: Unrelated warning about line endings in ScheduleMap.test.ts (from previous work)

### Regression Assessment
✅ **Low Risk**
- Only affects display classification, not stored data
- Elapsed-time displays unchanged
- Other components already using correct logic
- Shared helper ensures consistency going forward

---

## Stored Timestamp/Data Semantics

✅ **Confirmed Unchanged**
- No modifications to database timestamps
- No changes to API contracts
- No changes to event ordering
- No changes to customer activity semantics
- No changes to call timestamps
- No changes to notification timestamps
- No changes to schedule calculations

**This is DISPLAY CLASSIFICATION ONLY.**

---

## Recommendation

✅ **RECOMMEND COMMITTING**

**Reasons:**
1. Focused fix for confirmed display semantics bug
2. Low risk - only affects display labels, not business logic
3. All validation passed (typecheck, build, git diff --check, boundary tests)
4. No changes to stored data or API contracts
5. Shared helper ensures consistency across the codebase
6. Elapsed-time displays intentionally left unchanged
7. Proper timezone handling using local calendar components
8. Comprehensive boundary tests cover all edge cases

**What Changed:**
- Created shared calendar-relative date helpers in utils.ts
- Updated RecentLeadsSection.tsx to use shared helpers
- Added comprehensive boundary tests
- Fixed trailing whitespace

**What Stayed the Same:**
- All elapsed-time displays ("X ago" format)
- Components already using correct calendar-day logic
- All stored timestamps and data
- All API contracts and database behavior

---

## Summary

Successfully fixed the misleading Today/Yesterday date labeling bug by replacing rolling 24-hour elapsed-time logic with proper calendar-day comparison. The fix is surgical, focused on display classification only, and includes comprehensive boundary tests. All validation passed, and no business logic or stored data was modified. The change is ready for commit and deployment.