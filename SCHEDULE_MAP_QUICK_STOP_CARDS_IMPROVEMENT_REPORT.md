# Schedule Map Quick Stop Cards Improvement Report

## Summary

Improved the quick stop cards above the Schedule Map to clearly show title, time range, and type icon, making it easier for users to quickly identify each stop without opening the full detail.

---

## PART 1 — Exact Component/File

**Component:** Inline rendering within `ScheduleMap.tsx`
**File:** `src/components/schedule/ScheduleMap.tsx`
**Lines:**
- Desktop: Lines 2252-2308
- Mobile: Lines 2400-2456

**Data Object:** `MapItem` interface
```typescript
interface MapItem {
  id: string
  type: MapItemType // 'job' | 'appointment' | 'task' | 'business'
  title: string
  customerName: string | null
  customerPhone: string | null
  address: string
  scheduledDate: string | null
  scheduledTime: string | null
  scheduledEndTime: string | null
  status: string | null
  leadId: string | null
  jobId: string | null
  taskId: string | null
  eventId: string | null
  latitude: number
  longitude: number
  stopNumber?: number
}
```

**Available Fields Used:**
- `title` - item title
- `scheduledTime` - start time
- `scheduledEndTime` - end time
- `type` - item type (job/appointment/task/business)
- `stopNumber` - stop number
- Selected state derived from `selectedMapItemId`

---

## PART 2 — Title

**Before:** Title was shown as fallback only when time was missing: `formatTimeRangeHHMM(item.scheduledTime, item.scheduledEndTime) || item.title`

**After:** Title is always shown as primary text with fallback to type name:
```typescript
{item.title || (item.type === 'job' ? 'Job' : item.type === 'appointment' ? 'Appointment' : 'Task')}
```

**Examples:**
- "Sunday - Reserved Boxes"
- "Plumbing Repair"
- "Estimate Appointment"
- "Call Customer About Quote"

**Fallback Behavior:**
- If title exists: show title
- If title missing: show "Job", "Appointment", or "Task" based on type
- Business type: always shows business title

**Truncation:** Single-line ellipsis via `truncate` class (preserved from original)

---

## PART 3 — Time Range

**Formatting:** Uses existing `formatTimeRangeHHMM` helper function
```typescript
function formatTimeRangeHHMM(startTime: string | null, endTime: string | null): string {
  const formattedStart = formatTime12Hour(startTime)
  if (!endTime) {
    return formattedStart
  }
  const formattedEnd = formatTime12Hour(endTime)
  return `${formattedStart} – ${formattedEnd}`
}
```

**Examples:**
- "9:00 AM – 10:00 AM"
- "5:00 PM – 6:30 PM"
- "5:00 PM" (start only, no end time)
- "" (empty if no time)

**All-Day Events:** Currently shows empty string. No explicit "All day" label in current MapItem data structure. This is acceptable - the card will just show icon without time.

**Timezone:** Uses existing `formatTime12Hour` from `calendar-date-utils.ts` which already handles timezone conversion correctly for the application.

---

## PART 4 — Type Icon

**Icon Mapping:**
- Job: `Briefcase` (from lucide-react)
- Appointment: `Calendar` (from lucide-react)
- Task: `CheckCircle` (added to imports)
- Business: 🏠 emoji (preserved from original)

**Implementation:**
```typescript
{item.type === 'job' && <Briefcase size={10} />}
{item.type === 'appointment' && <Calendar size={10} />}
{item.type === 'task' && <CheckCircle size={10} />}
```

**Icon Size:** 10px to match compact card scale (text-[8px] to text-[11px])

**No Emojis:** Used Lucide icons for consistency with ReplyFlow design system

---

## PART 5 — Card Information Hierarchy

**New Compact Hierarchy:**
```
[stop badge]  [Title                    ]
              [type icon] 9:00 AM – 10:00 AM
```

**Structure:**
- **Primary text:** Title (strongest textual information)
- **Secondary text:** Type icon + time range (icon communicates type, time shows when)
- **Stop badge:** Number + color identity (preserved)

**Layout:**
- Stop badge on left
- Title on top line
- Icon + time on bottom line (flex row with gap-1)
- Truncation on both lines

---

## PART 6 — Stop Number + Colors

**Preserved Behavior:**
- Deterministic stop numbering via `assignStopNumbers` function
- Distinct stop colors via `STOP_COLOR_PALETTE` array
- Stop number badge uses type-specific background colors:
  - Job: purple (`bg-purple-100/50 dark:bg-purple-900/15 text-purple-600 dark:text-purple-400`)
  - Appointment: blue (`bg-blue-100/50 dark:bg-blue-900/15 text-blue-600 dark:text-blue-400`)
  - Business: green (`bg-green-100/50 dark:bg-green-900/15 text-green-600 dark:text-green-400`)

**Stop Color Palette:** Colorblind-accessible palette (red, amber, emerald, blue, violet, pink, teal, orange)

**Not Relying on Color Alone:** Stop number remains visible in badge, title provides text identity

---

## PART 7 — Selected State

**Preserved Behavior:**
```typescript
className={`... ${
  selectedMapItemId === item.id
    ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-300/60 dark:border-blue-700/60 ring-1 ring-blue-200/50 dark:ring-blue-800/30'
    : ...
}`}
```

**Selected Treatment:**
- Lighter blue background
- Blue border
- Blue ring
- Stop identity colors preserved

**No Identity Color Replacement:** Selected state uses blue accent but preserves stop number color

---

## PART 8 — Card Width / Overflow

**Preserved Dimensions:**
- Desktop: `min-w-[100px] md:min-w-[120px] max-w-[140px]`
- Mobile: `min-w-[100px] max-w-[140px]`

**Overflow Behavior:**
- Horizontal scrolling via `overflow-x-auto`
- Snap scrolling via `snap-x snap-mandatory`
- Touch pan via `touch-pan-x`
- Hidden scrollbars via `scrollbarWidth: none` and `msOverflowStyle: none`

**Truncation:** Single-line ellipsis on both title and time lines

**Three+ Stops Practical:** Compact cards with max-width ensure multiple stops fit

---

## PART 9 — Mobile

**Mobile Behavior:**
- Title: text-[9px] (preserved)
- Time: text-[8px] (preserved)
- Icon: size={10} (preserved)
- Stop number: text-[8px] (preserved)
- Horizontal scrolling: preserved
- No overflow into map controls: preserved (flex layout maintained)

**Card Height:** Unchanged - no dramatic height increase. Icon is same size as text, fits in existing vertical space.

---

## PART 10 — Click Behavior

**Preserved Behavior:**
- `onClick={() => selectMapItem(item.id, item.latitude, item.longitude)}`
- Selects corresponding map item
- Marker selection works
- Detail card updates
- Existing panToMarker behavior preserved

**Autofocus Logic:** Not touched - this task is presentation only

---

## PART 11 — Data Fallbacks

**Handled Cases:**
- Missing title: Falls back to "Job"/"Appointment"/"Task" based on type
- Missing end time: Shows only start time via `formatTimeRangeHHMM`
- No time: Shows empty string (icon only)
- Job without scheduled end: Shows start time only
- Appointment with start/end: Shows full range
- Task if on map: Shows CheckCircle icon + time

**No Invalid Output:**
- No `undefined` displayed
- No `Invalid Date` displayed
- No `--` displayed
- No broken separators (empty string when no time)

---

## PART 12 — Tests

**Tests Run:**
- 440 schedule tests passed
- Production build successful
- TypeScript validation passed

**Test Coverage:**
Existing schedule tests cover:
- Stop numbering
- Map camera behavior
- Auto-framing
- Customer resolution
- Time range formatting
- Layout

The change is purely presentational and doesn't alter logic, so existing tests provide coverage. The visual change is:
- Title always shown (was conditional)
- Time moved from primary to secondary line
- Type text replaced with icon

All existing tests pass, confirming no behavioral regression.

---

## Files Changed

1. `src/components/schedule/ScheduleMap.tsx`
   - Added `CheckCircle` to imports
   - Updated desktop quick stop card structure (lines 2284-2308)
   - Updated mobile quick stop card structure (lines 2435-2456)

**Changes:**
- Primary line now always shows title with fallback
- Secondary line now shows type icon + time range
- Type text replaced with icon

---

## Commit SHA

`038df16f` - "improve Schedule Map quick stop cards to show title, time range, and type icon"

---

## Production TypeScript Result

✓ TypeScript validation passed

---

## Build Result

✓ Production build successful
- Compiled successfully in 16.6s
- No TypeScript errors
- No build errors

---

## Git Diff --check Result

✓ No whitespace errors detected

---

## New Card Structure

**Before:**
```
[stop badge]  [9:00 AM – 10:00 AM    ]
              [Job                   ]
```

**After:**
```
[stop badge]  [Plumbing Repair       ]
              [💼] 9:00 AM – 10:00 AM
```

---

## Title Fallback Semantics

- If title exists: show title
- If title missing: show type name ("Job"/"Appointment"/"Task")
- Business type: always shows business title

---

## Start/End Formatting

- Uses existing `formatTimeRangeHHMM` helper
- Format: "9:00 AM – 10:00 PM"
- No end time: "9:00 AM"
- No time: "" (empty string, icon only)

---

## Type → Icon Mapping

- Job → Briefcase
- Appointment → Calendar
- Task → CheckCircle
- Business → 🏠 emoji (preserved)

---

## Stop Color/Number Behavior

- Stop numbering: Deterministic, chronological order
- Stop colors: Colorblind-accessible palette
- Badge colors: Type-specific (purple for job, blue for appointment, green for business)
- Stop number: Always visible in badge

---

## Selected Behavior

- Selected state: Blue background + border + ring
- Stop identity colors: Preserved
- No replacement of identity color with selection color

---

## Mobile Behavior

- Title: text-[9px] font-medium
- Time: text-[8px] with icon
- Icon: size={10}
- Stop number: text-[8px]
- Horizontal scrolling: Preserved
- Card height: Unchanged

---

## Proof Autofocus Untouched

- No changes to autofocus logic
- No changes to panToMarker
- No changes to camera model
- Click behavior preserved
- All camera/focus tests pass (440 tests)

---

## Success Criteria

✓ User can look at quick stop strip and immediately understand:
- **WHAT:** the title (primary text)
- **WHEN:** start/end time (secondary text with icon)
- **WHAT KIND:** Job/Appointment/Task icon
- **WHICH STOP:** number + existing color identity

✓ No need to open full stop detail to identify the stop
✓ Cards remain compact and scannable
✓ Three or more stops remain practical
✓ Mobile behavior preserved
✓ No autofocus/camera changes