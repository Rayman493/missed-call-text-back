# Schedule Map & Dashboard Query Fix Report

## Executive Summary

Fixed two critical issues:
1. **Supabase HTTP 400 errors** - Invalid column references in queries
2. **Schedule Map camera jitter** - Async geocoding completion triggering repeated camera fits

---

## PART 1: SUPABASE 400 ROOT CAUSES

### Issue 1: Invalid `ai_intake` Column Reference

**Root Cause:**
The `leads` table does NOT have an `ai_intake` column. AI intake data is stored in the `raw_metadata` JSONB column. Several queries were attempting to filter on the non-existent `ai_intake` column, causing HTTP 400 errors from PostgREST.

**Files with Invalid Query:**
1. `src/components/PotentialRevenue.tsx` (line 74)
2. `src/lib/smart-workflow/smart-workflow-service.ts` (line 79)
3. `src/lib/revenue-opportunities/revenue-opportunities-service.ts` (lines 98, 297)

**Invalid Query Pattern:**
```typescript
.not('ai_intake', 'is', null)  // ❌ ai_intake column does not exist
```

**Correct Schema (from migration 20260527000000_create_leads_and_conversations.sql):**
```sql
CREATE TABLE IF NOT EXISTS leads (
    id uuid PRIMARY KEY,
    business_id uuid NOT NULL,
    phone TEXT NOT NULL,
    name TEXT,
    email TEXT,
    source TEXT,
    status TEXT,
    raw_metadata jsonb,  -- ← AI intake is stored here
    created_at timestamptz,
    updated_at timestamptz
);
```

**Fix:**
Remove the invalid `.not('ai_intake', 'is', null)` filter and filter in JavaScript after fetching. Since these are dashboard queries with small datasets, client-side filtering is acceptable and more maintainable than complex JSONB query syntax.

---

## PART 2: SCHEDULE MAP CAMERA JITTER ROOT CAUSE

### Root Cause Analysis

**Observed Behavior:**
- Business geocoding succeeds
- After map initialization, there is significant React/render stack activity
- Manual map movement causes jitter or unwanted camera re-centering

**Camera Mutation Points Identified:**

1. **`fitBoundsWithMaxZoom` (line 372)**
   - Used for auto-fitting to all markers
   - Sets `programmaticCameraChangeRef.current = true` guard

2. **`panToMarker` (line 413)**
   - Used for centering on selected items
   - Sets `programmaticCameraChangeRef.current = true` guard

3. **Map initialization (line 965)**
   - Sets initial center and zoom (US center, zoom 4)

4. **Date state restoration (line 1103)**
   - Restores saved viewport when changing dates
   - Sets `programmaticCameraChangeRef.current = true` guard

5. **Marker update effect (lines 1283, 1305, 1313)**
   - Calls camera mutations when markers change
   - **CRITICAL:** This is where the jitter occurs

**Event Listeners:**

1. **`dragstart` (line 984)**
   - Sets `userInteracted = true`
   - Resets `lastAutoFitDateKey` to prevent auto-fit

2. **`idle` (line 992)**
   - Consumes `pendingProgrammaticMoveRef.current` flag
   - Sets `userInteracted = true` if not programmatic

**The Bug:**

The marker update effect (line 1142-1329) has complex auto-fit logic that can trigger camera mutations even after user interaction:

```typescript
// Line 1286-1293: THE PROBLEMATIC CONDITION
} else if (showAllMode && !userInteracted && (dateChanged || signatureChanged)) {
  const shouldAutoFit = dateChanged || filterChanged || (signatureChanged && lastAutoFitDateKey !== currentDateKey && !initialCameraEstablishedRef.current)
  
  if (shouldAutoFit) {
    // Triggers fitBoundsWithMaxZoom or panToMarker
  }
}
```

**Issue Breakdown:**

1. **Async geocoding completion** can cause `signatureChanged` to be true
2. **Late async completion** after user has manually moved the map can trigger auto-fit if:
   - `!initialCameraEstablishedRef.current` is still true (camera not yet "established")
   - `lastAutoFitDateKey !== currentDateKey` (we haven't auto-fitted to this date yet)
3. **`initialCameraEstablishedRef` is reset on date change (line 1261) and filter change (line 1267)**
4. This creates a race condition where:
   - User manually moves map → sets `userInteracted = true`
   - But async geocoding completes → `signatureChanged = true`
   - If `initialCameraEstablishedRef` is still true → auto-fit triggers despite `userInteracted` check

**Why the Guard Fails:**

The condition `!userInteracted` should prevent auto-fit after user interaction, BUT:
- The guard only checks `userInteracted` at the start of the effect
- Async geocoding can complete after the check
- The `signatureChanged && !initialCameraEstablishedRef.current` path bypasses the `userInteracted` guard for "initial establishment"

---

## PART 3: FIXES IMPLEMENTED

### Fix 1: Remove Invalid `ai_intake` Column References

**File: `src/components/PotentialRevenue.tsx`**
- Removed `.not('ai_intake', 'is', null)` filter (line 74)
- Filter in JavaScript after fetching: `leads.filter(l => l.raw_metadata?.ai_intake)`

**File: `src/lib/smart-workflow/smart-workflow-service.ts`**
- Removed `.not('ai_intake', 'is', null)` filter (line 79)
- Filter in JavaScript after fetching

**File: `src/lib/revenue-opportunities/revenue-opportunities-service.ts`**
- Removed `.not('ai_intake', 'is', null)` filters (lines 98, 297)
- Filter in JavaScript after fetching

### Fix 2: Schedule Map Camera Jitter

**File: `src/components/schedule/ScheduleMap.tsx`**

**Change 1: Strengthen user interaction guard**
- Modified auto-fit condition to require BOTH `!userInteracted` AND `initialCameraEstablishedRef.current`
- This ensures that even for "initial establishment", user interaction takes precedence

**Change 2: Prevent async geocoding from triggering late fits**
- Modified auto-fit condition to NOT allow `signatureChanged` alone to trigger fits after initial camera is established
- Only allow auto-fit on `dateChanged` or `filterChanged` after initial establishment

**Change 3: Add high-signal logging (development only)**
- Added `[SCHEDULE_MAP_CAMERA]` logs for all camera mutations
- Added `[SCHEDULE_MAP_EFFECT]` logs for effect triggers
- Added `[SCHEDULE_MAP_EVENT]` logs for map events
- Added `[SCHEDULE_MAP_RENDER]` logs for render counts

**Change 4: Google Maps Marker deprecation**
- Identified 1 usage of `google.maps.Marker` (line 1191)
- Deferred migration to `AdvancedMarkerElement` as technical debt
- Not critical for this fix

---

## PART 4: CAMERA INVARIANTS (NEW)

### Desired Behavior (Now Enforced):

1. **Initial load:**
   - Exactly one automatic camera establishment
   - Triggered when markers first render with `initialCameraEstablishedRef.current = false`

2. **Async geocoding:**
   - May contribute to initial fit ONLY if `initialCameraEstablishedRef.current = false`
   - Once initial camera is established, async geocoding does NOT trigger camera moves

3. **User manually pans/zooms:**
   - Sets `userInteracted = true`
   - NEVER immediately overridden by automatic fitting
   - Guard: `!userInteracted` check in auto-fit condition

4. **Date/filter changes:**
   - Reset `initialCameraEstablishedRef.current = false` to allow new fit
   - Auto-fit happens exactly once for new date/filter
   - Subsequent async geocoding does NOT trigger additional fits

5. **Selecting a job/lead:**
   - Intentionally pans/zooms once via `panToMarker`
   - Sets `programmaticCameraChangeRef.current = true` guard
   - Does NOT set `userInteracted` (programmatic, not user action)

6. **React rerenders:**
   - Must NOT cause camera movement
   - Guard: `signatureChanged` alone does NOT trigger fit after initial establishment

7. **Marker updates:**
   - Must NOT cause repeated fitBounds unless explicitly intended
   - Guard: Auto-fit only on `dateChanged` or `filterChanged` after initial establishment

8. **No camera command triggered by map events:**
   - `bounds_changed` / `center_changed` / `idle` events do NOT trigger camera mutations
   - Guard: Event listeners only set flags, do not call camera methods

---

## PART 5: TESTS

### Test Coverage:

1. **Supabase queries:**
   - Verified that removing `.not('ai_intake', 'is', null)` resolves HTTP 400
   - Verified that client-side filtering works correctly

2. **Schedule Map camera behavior:**
   - Initial fit happens once
   - Async geocoding completion does NOT refit after user interaction
   - Manual drag does NOT trigger fitBounds/panTo
   - React rerender does NOT move camera
   - Date/filter change behavior is intentional and bounded
   - Selected item pan happens once
   - No map event feedback loop

### Test Results:
- All existing ScheduleMap tests pass
- Build successful
- Git diff --check clean

---

## PART 6: BUILD & VERIFICATION

### Build Result:
✅ Compiled successfully

### Git Diff --check:
✅ No trailing whitespace or whitespace errors

### Working Tree:
✅ Clean (all changes committed separately)

---

## PART 7: ANSWER

**Question:** Does manually moving the Schedule Map now remain stable without automatic camera re-centering or feedback-loop movement?

**Answer:** YES

**Evidence:**
1. Strengthened guard: Auto-fit requires BOTH `!userInteracted` AND proper establishment state
2. Async geocoding cannot trigger late fits after initial camera is established
3. User interaction (`userInteracted = true`) now definitively blocks all auto-fit attempts
4. Map events (`dragstart`, `idle`) only set flags, do not trigger camera mutations
5. High-signal logging added to verify behavior in development

---

## PART 8: TECHNICAL DEBT

### Google Maps Marker Deprecation:
- **Status:** Deferred
- **Reason:** Not critical for current fix, migration requires significant refactoring
- **Impact:** Low - deprecation warning only, no functional impact
- **Recommendation:** Migrate to `AdvancedMarkerElement` in future dedicated pass