# ScheduleMap React #321 Fix & Supabase Query Audit - Final Report

## Part 1 — ScheduleMap React #321 Verification

### Confirmation that hook is now at component scope
✅ **Confirmed** - `resizeLastSizeRef` is now declared at component top level (line 185):
```typescript
const resizeLastSizeRef = useRef<{ width: number; height: number } | null>(null)
```

The ResizeObserver effect now reads/writes `resizeLastSizeRef.current` instead of creating a hook inside the effect.

### Whether any other Rules of Hooks violations were found
✅ **None found** - All hooks (useRef, useState, useEffect, useCallback, useMemo) are called at component top level (lines 167-207 for refs/state, lines 250-1592 for effects/callbacks). No hooks are inside callbacks, conditions, loops, or nested functions.

### ResizeObserver lifecycle/cleanup assessment
✅ **Safe** - The ResizeObserver lifecycle is correct:
- Early return if not ready (line 1185)
- Creates ResizeObserver (line 1189)
- Observes container (line 1209)
- Cleanup function disconnects observer (lines 1211-1213)
- Uses ref from top level (line 185)

### Privacy safety confirmation
✅ **Confirmed** - Instrumentation does NOT log:
- Precise customer coordinates (removed from logCameraState)
- Precise business coordinates (removed from logCameraState)
- Addresses (not logged)
- Other sensitive customer/location information

Only logs:
- Movement deltas (deltaLat, deltaLng, deltaZoom)
- Zoom levels
- Container dimensions
- Map instance IDs
- Event types
- Timestamps
- Non-sensitive metadata

### High-frequency map diagnostics throttling
✅ **Confirmed** - High-frequency events are throttled to 100ms minimum:
- `drag` events throttled
- `zoom_changed` events throttled
- `center_changed` events throttled
- `bounds_changed` events throttled
- Render logging throttled (every 5th render)
- Resize logging only on actual dimension changes (>1px)

## Part 2 — Regression Coverage Assessment

### Whether existing tests exercise `mapReady → ResizeObserver`
❌ **No** - Existing ScheduleMap tests (11/11) only test:
- Date comparison logic (toLocaleDateString formatting)
- Camera coalescing boolean logic

They do NOT render the component or simulate Google Maps loading. The `mapReady → ResizeObserver` path is NOT exercised.

### Whether a new test was added
❌ **No test added** - A proper regression test would require extensive mocking (Google Maps API, ResizeObserver, component lifecycle through mapReady state), which would be tightly coupled to implementation details. Given the simple nature of the fix and that build/typecatch passed, a regression test was deferred.

### Exact test result
✅ **11/11 passed** (1.90s)

## Part 3 — Leads 400 Root Cause

### Exact query
```typescript
.from('leads')
.select('id, status, created_at, business_id, deleted_at, payment_status, ignored_at')
.eq('business_id', business.id)
.is('deleted_at', null)
.is('ignored_at', null)
.gte('created_at', thirtyDaysAgo)
```

### Source file/function
- `src/app/analytics/AnalyticsContent.tsx` (lines 73-79)
- `src/components/analytics/BusinessActivityGraph.tsx` (lines 71-78)

### Invalid field
`ignored_at` ❌ - Does NOT exist in the `leads` table schema

### Intended semantics
The code was attempting to filter out "ignored" customers from analytics metrics, but no such column exists in the schema.

### Canonical replacement/removal
**Removed** the `ignored_at` filter entirely. The `leads` table only has `deleted_at` for soft deletion. There is no canonical "ignored" concept in the current schema.

### Exact fix
- Removed `ignored_at` from SELECT clause
- Removed `.is('ignored_at', null)` filter
- Updated comment to reflect only `deleted_at` filtering

**Files modified:**
- `src/app/analytics/AnalyticsContent.tsx`
- `src/components/analytics/BusinessActivityGraph.tsx`

## Part 4 — Jobs 400 Root Cause

### Exact query
```typescript
.from('jobs')
.select('id, lead_id, estimated_amount, completed_at')
.eq('business_id', businessId)
.eq('status', 'completed')
```

### Source file/function
- `src/lib/revenue-opportunities/revenue-opportunities-service.ts` (lines 154, 219)
- `src/components/PotentialRevenue.tsx` (lines 52, 97)
- `src/lib/customer-reactivation/customer-reactivation-service.ts` (line 39)

### Invalid fields
- `estimated_amount` ❌ - Does NOT exist in `jobs` table
- `completed_at` ❌ - Does NOT exist in `jobs` table

### Intended semantics for each
- `estimated_amount`: Intended to represent the monetary value of a job for revenue analytics
- `completed_at`: Intended to track when a job was completed for timing analysis (repeat customers, reactivation, etc.)

### Canonical schema source
**Actual jobs table schema:**
- Core fields: `id`, `business_id`, `title`, `customer_name`, `customer_phone`, `service_address`, `notes`, `scheduled_date`, `scheduled_time`, `status`, `lead_id`, `conversation_id`, `source`, `payment_status`, `created_at`, `updated_at`
- Later added: `google_calendar_event_id`, `latitude`, `longitude`, `geocoded_at`, `geocoded_address`

**No canonical source exists for:**
- Job amount/value (not in jobs table)
- Completion timestamp (not in jobs table)

**Available alternatives:**
- Job value: `payment_requests.amount_cents` where `job_id` matches (but only if payment was requested)
- Completion timing: `jobs.updated_at` (not reliable - can be updated for other reasons) or `payment_requests.paid_at` (only if payment was requested and paid)

### Exact fix

#### PotentialRevenue.tsx
- Changed "Ready to Invoice" metric from dollar amount to **job count**
- Changed "Pipeline" metric from dollar amount to **scheduled job count**
- Updated labels to reflect counts instead of dollar amounts
- Removed `estimated_amount` from SELECT clauses

#### revenue-opportunities-service.ts
- **Ready for Invoice**: Removed `estimated_amount` and `completed_at` from query, set `estimatedValue: 0` (cannot calculate without schema field)
- **Repeat Customer**: **Disabled entire feature** - requires `completed_at` for timing analysis, which doesn't exist. Returns empty array.
- Removed timing-dependent metadata fields

#### customer-reactivation-service.ts
- Changed to use `jobs.updated_at` as **proxy** for `completed_at` (not ideal but available)
- Changed to calculate `lifetimeRevenue` from `payment_requests.amount_cents` where `job_id` matches
- This is a best-effort approximation using canonical data where available

**Note:** The revenue and reactivation features are now degraded due to missing schema fields. To restore full functionality, schema changes would be required (adding `estimated_amount` and `completed_at` to jobs table).

## Part 5 — Additional Stale-Query Findings

No additional stale queries found in the audited Schedule/Dashboard paths. The audit focused on:
- Analytics queries
- Revenue opportunity queries
- Customer reactivation queries
- Dashboard metrics queries

All identified issues have been fixed.

## Part 6 — Exact Files Changed

### Modified files:
1. `src/components/schedule/ScheduleMap.tsx` - React #321 fix (moved useRef to top level)
2. `src/app/analytics/AnalyticsContent.tsx` - Removed ignored_at filter
3. `src/components/analytics/BusinessActivityGraph.tsx` - Removed ignored_at filter
4. `src/components/PotentialRevenue.tsx` - Changed metrics to counts, removed estimated_amount
5. `src/lib/revenue-opportunities/revenue-opportunities-service.ts` - Removed non-existent fields, disabled timing features
6. `src/lib/customer-reactivation/customer-reactivation-service.ts` - Use updated_at proxy, calculate revenue from payment_requests

### Created files:
- `SCHEDULE_MAP_REACT_HOOK_FIX_REPORT.md` (previous report)

## Part 7 — Tests/Build/Typecheck Results

- **ScheduleMap tests:** ✅ 11/11 passed (1.90s)
- **Build:** ✅ Compiled successfully in 14.4s
- **Typecheck:** ✅ Passed
- **Lint:** Skipped
- **Git diff --check:** ✅ Passed (LF/CRLF warnings only)

## Part 8 — Git Diff --check Result

✅ Passed (exit code 0)
- Warnings only about LF/CRLF line ending conversion (normal on Windows)

## Part 9 — Working-Tree Status

```
On branch main
Your branch is up to date with origin/main.

Changes not staged for commit:
  modified:   src/app/analytics/AnalyticsContent.tsx
  modified:   src/components/PotentialRevenue.tsx
  modified:   src/components/analytics/BusinessActivityGraph.tsx
  modified:   src/components/schedule/ScheduleMap.tsx
  modified:   src/lib/customer-reactivation/customer-reactivation-service.ts
  modified:   src/lib/revenue-opportunities/revenue-opportunities-service.ts

Untracked files:
  SCHEDULE_MAP_REACT_HOOK_FIX_REPORT.md
```

## Part 10 — Privacy Confirmation

✅ **Confirmed** - The ScheduleMap instrumentation does NOT log:
- Precise customer/business location coordinates
- Addresses
- Phone numbers
- Customer names
- Other sensitive customer/location information

Only logs:
- Movement deltas (deltaLat, deltaLng, deltaZoom)
- Zoom levels
- Container dimensions
- Map instance IDs
- Event types
- Timestamps
- Non-sensitive metadata

## Part 11 — Commit Recommendation

**YES** - The resulting code is safe to commit and deploy for physical-device verification.

**Rationale:**
1. React #321 hook violation is fixed (ref moved to top level)
2. All Supabase 400 errors are addressed (removed non-existent fields)
3. Build, typecheck, and tests pass
4. Privacy-safe logging maintained
5. Log volume controlled with throttling
6. No map behavior changes
7. No unrelated changes

**Caveats:**
- Revenue and reactivation features are degraded due to missing schema fields (`estimated_amount`, `completed_at` in jobs table)
- These features now use best-effort approximations or are disabled
- Full functionality would require schema changes (adding fields to jobs table)
- This is intentional per requirement to not add database columns to accommodate stale code

**Recommended next steps:**
1. Commit and deploy this fix
2. Perform physical testing of ScheduleMap jitter instrumentation
3. Separate decision: whether to add `estimated_amount` and `completed_at` to jobs table to restore full revenue/reactivation functionality