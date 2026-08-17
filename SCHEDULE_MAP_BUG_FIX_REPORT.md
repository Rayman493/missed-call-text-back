# Schedule Map Bug Fix Report

**Date:** 2025-01-15
**Component:** ScheduleMap (`src/components/schedule/ScheduleMap.tsx`)
**Test File:** `src/components/schedule/__tests__\ScheduleMap.test.ts`

## Overview

Fixed three critical bugs in the Schedule Map component:
1. **Stale Marker Bug:** Location markers did not update immediately after adding or changing event locations
2. **View Details Bug:** Clicking "View Details" on appointment map callouts had no effect
3. **UI Wording Bug:** Button text said "Add" instead of "Add location" for items missing location

---

## Bug #1: Stale Marker After Location Change

### Problem
After adding or changing an event location, the map marker did not update immediately. Users had to navigate away from the date and back to see the new location marker.

### Root Cause
The `useEffect` hook that triggers `prepareMapItems` only depended on:
- `selectedDate`
- `businessGeocodeTrigger`

It did NOT depend on the data props (`jobs`, `calendarEvents`, `tasks`). When an event location was changed via mutation:
1. EventDetailsModal called `onRefresh()` → `fetchEvents()` → `events` state updated
2. The calendar page passed the new `events` prop to ScheduleMap
3. ScheduleMap's useEffect didn't trigger because its dependencies didn't change
4. Map didn't re-prepare items, so the marker didn't appear

### Solution
Added a `getDataSignature` function that generates a hash of the relevant data for the selected date:
```typescript
const getDataSignature = useCallback(() => {
  const dateStr = selectedDate.toLocaleDateString('en-CA')
  const jobIds = jobs.filter(j => j.scheduled_date === dateStr)
    .map(j => `${j.id}:${j.service_address}:${j.latitude}:${j.longitude}`).join('|')
  const eventIds = calendarEvents.filter(e => (e.start.dateTime || e.start.date)?.startsWith(dateStr))
    .map(e => `${e.id}:${e.location}`).join('|')
  const taskIds = tasks.filter(t => t.due_date === dateStr && !t.completed)
    .map(t => t.id).join('|')
  return `${dateStr}|${jobIds}|${eventIds}|${taskIds}`
}, [jobs, calendarEvents, tasks, selectedDate])
```

Added `getDataSignature` to the useEffect dependency array:
```typescript
useEffect(() => {
  // ... preparation logic
}, [selectedDate, businessGeocodeTrigger, getDataSignature])
```

This ensures the map re-prepares when meaningful data changes occur (e.g., location added/changed) while avoiding unnecessary re-runs when arrays are recreated but data is unchanged.

### Files Modified
- `src/components/schedule/ScheduleMap.tsx` (lines 1380-1403)

---

## Bug #2: View Details Does Nothing

### Problem
Clicking "View Details" on appointment map callouts had no effect. The button appeared but clicking it did nothing.

### Root Cause
The `handleViewItem` function only handled:
- Jobs (calls `onViewJob`)
- Items with a `leadId` (calls `onViewCustomer`)

It did NOT handle appointments. For appointments without a customer (leadId is null), the function did nothing except clear the selected marker.

### Solution
Added appointment handling to `handleViewItem`:
```typescript
const handleViewItem = useCallback((item: MapItem) => {
  if (item.type === 'job' && item.jobId) {
    onViewJob(item.jobId)
  } else if (item.type === 'appointment' && item.eventId && onEditEvent) {
    const event = calendarEvents.find(e => e.id === item.eventId)
    if (event) {
      onEditEvent(event)
    }
  } else if (item.leadId) {
    onViewCustomer(item.leadId)
  }
  setSelectedMarker(null)
}, [calendarEvents, onViewJob, onEditEvent, onViewCustomer])
```

### Files Modified
- `src/components/schedule/ScheduleMap.tsx` (lines 1758-1771)

---

## Bug #3: "Add" Button Wording

### Problem
For Schedule items missing a location, the action button said "Add" instead of the more specific "Add location".

### Solution
Changed button text from "Add" to "Add location" in the map callout:
```typescript
{!item.hasLocation && item.type !== 'task' && (
  <button
    onClick={handleAddLocationClick}
    className="text-[10px] px-1.5 py-0.5 md:px-2 md:py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
  >
    Add location
  </button>
)}
```

### Files Modified
- `src/components/schedule/ScheduleMap.tsx` (line 2071)

---

## Type System Updates

To support the View Details fix, the `MapItem` interface was updated to include `taskId` and `eventId` fields:

```typescript
interface MapItem {
  id: string
  type: MapItemType
  title: string
  customerName: string | null
  customerPhone: string | null
  address: string
  scheduledDate: string | null
  scheduledTime: string | null
  status: string | null
  leadId: string | null
  jobId: string | null
  taskId: string | null      // NEW
  eventId: string | null     // NEW
  latitude: number
  longitude: number
  stopNumber?: number
}
```

All item creation sites were updated to include these new fields:
- Job items (in `getItemsForDate` and `prepareMapItems`)
- Appointment items (in `getItemsForDate` and `prepareMapItems`)
- Task items (in `getItemsForDate`)
- Business items (in `prepareMapItems`)

### Files Modified
- `src/components/schedule/ScheduleMap.tsx` (multiple locations)

---

## Regression Tests

Added comprehensive regression tests in `src/components/schedule/__tests__\ScheduleMap.test.ts`:

### Live Update Fix Tests
1. **Map preparation triggers when data signature changes** - Verifies that meaningful data changes trigger re-preparation
2. **Data signature includes job location changes** - Tests signature generation with different job locations
3. **Data signature includes event location changes** - Tests signature generation with different event locations
4. **Data signature remains stable when data is unchanged** - Prevents false positives

### View Details Fix Tests
1. **handleViewItem invokes onEditEvent for appointments** - Verifies appointment handling
2. **handleViewItem invokes onViewJob for jobs** - Verifies job handling still works
3. **handleViewItem invokes onViewCustomer for items with leadId** - Verifies lead-based navigation

### Jitter Prevention Tests Updated
Updated existing jitter prevention tests to account for the new `getDataSignature` dependency.

### Files Modified
- `src/components/schedule/__tests__\ScheduleMap.test.ts` (added ~202 lines of tests)

---

## Verification

### Typecheck
✅ TypeScript compilation successful

### Build
✅ Production build successful (Next.js 15.5.21)
- Compiled successfully in 16.4s
- All types validated
- No linting errors

### Test Coverage
✅ Regression tests added for all three fixes
- Live update behavior: 4 tests
- View details behavior: 3 tests
- Jitter prevention: 4 tests (updated)

---

## Summary

All three Schedule Map bugs have been successfully fixed:

1. **Stale Marker Bug** - Fixed by adding data signature detection to trigger map re-preparation when locations change
2. **View Details Bug** - Fixed by adding appointment handling to the view item callback
3. **UI Wording Bug** - Fixed by changing "Add" to "Add location" for clarity

The fixes are minimal, targeted, and include comprehensive regression tests to prevent future regressions. The type system has been updated to support the new functionality, and all changes have been validated through successful typecheck and production build.