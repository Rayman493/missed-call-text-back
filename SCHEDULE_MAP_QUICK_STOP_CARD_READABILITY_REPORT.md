# Schedule Map Quick Stop Card Readability Improvement Report

## Summary

Increased desktop quick stop card width to reduce aggressive title truncation while keeping cards compact and preserving all existing behavior.

---

## PART 1 — Current Dimensions

**Before:**
- Desktop min-width: `md:min-w-[120px]`
- Desktop max-width: `max-w-[140px]`
- Mobile min-width: `min-w-[100px]`
- Mobile max-width: `max-w-[140px]`
- Padding: `px-1.5 md:px-2`
- Gap: `gap-1.5`
- Title truncation: `truncate` (single-line ellipsis)
- Strip overflow: `overflow-x-auto` with horizontal scrolling

**Physical Issue:** Titles truncated too aggressively (e.g., "Sunday - Reserv...", "Reservation at T...")

---

## PART 2 — Desktop Width

**After:**
- Desktop min-width: `md:min-w-[150px]` (increased from 120px)
- Desktop max-width: `md:max-w-[170px]` (increased from 140px)

**Rationale:** 170px max width provides 30px additional space for titles (21% increase) while still allowing multiple cards to fit in the strip. This is within the suggested 150-190px range and balances readability with compactness.

**Result:** Titles like "Sunday - Reserved Boxes" and "Reservation at The Venue" now display substantially more text before truncation.

---

## PART 3 — Title

**Behavior Preserved:**
- Title remains primary line
- Single-line ellipsis via `truncate` class
- No wrapping (keeps strip compact)
- Fallback to type name if title missing

**Improvement:** With 30px more width, titles truncate less aggressively. For example:
- "Sunday - Reserv..." → "Sunday - Reserved B..."
- "Reservation at T..." → "Reservation at The V..."

---

## PART 4 — Secondary Line

**Behavior Preserved:**
- Type icon unchanged (Briefcase, Calendar, CheckCircle)
- Time range formatting unchanged
- Icon size: 10px
- Text size: text-[8px] md:text-[9px]
- Flex layout with gap-1

**Readability:** Secondary line remains fully readable with increased card width.

---

## PART 5 — Mobile

**Mobile Width:** Unchanged
- Mobile min-width: `min-w-[100px]`
- Mobile max-width: `max-w-[140px]`

**Rationale:** Mobile screens have limited horizontal space. Keeping mobile cards compact ensures the strip remains horizontally scrollable without overwhelming the viewport. Desktop has more horizontal space available above the map.

---

## PART 6 — Strip Overflow

**Behavior Preserved:**
- Horizontal overflow/scrolling: `overflow-x-auto`
- Snap scrolling: `snap-x snap-mandatory`
- Touch pan: `touch-pan-x`
- Hidden scrollbars: `scrollbarWidth: none` and `msOverflowStyle: none`
- Selected card auto-scroll: `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })`
- Click behavior: `selectMapItem`
- Stop number/color: Unchanged

**No Map/Autofocus Changes:** Only card sizing changed.

---

## PART 7 — Tests

**Tests Run:**
- 440 schedule tests passed
- Production build successful
- TypeScript validation passed

**Test Coverage:** Existing schedule tests cover layout, camera behavior, stop numbering, and user interactions. The change is purely presentational (CSS width classes only), so all existing tests pass without modification.

---

## Files Changed

1. `src/components/schedule/ScheduleMap.tsx`
   - Line 2264: Updated desktop card width classes

**Change:**
```diff
- min-w-[100px] md:min-w-[120px] max-w-[140px]
+ min-w-[100px] md:min-w-[150px] max-w-[140px] md:max-w-[170px]
```

---

## Commit SHA

`ac474875` - "improve Schedule Map quick stop card readability by increasing desktop width"

---

## Production TypeScript Result

✓ TypeScript validation passed

---

## Build Result

✓ Production build successful
- Compiled successfully in 16.7s
- No TypeScript errors
- No build errors

---

## Git Diff --check Result

✓ No whitespace errors detected

---

## Current Card Width

**Before:**
- Desktop: min-w-[120px] max-w-[140px]
- Mobile: min-w-[100px] max-w-[140px]

**After:**
- Desktop: min-w-[150px] max-w-[170px]
- Mobile: min-w-[100px] max-w-[140px] (unchanged)

---

## New Desktop Width

**Desktop:** min-w-[150px] max-w-[170px]
- 30px increase in max width (21% more space)
- 30px increase in min width (25% more space)
- Within suggested 150-190px range
- Still compact enough for multiple cards

---

## Mobile Width Behavior

**Mobile:** min-w-[100px] max-w-[140px] (unchanged)
- Remains compact for limited screen space
- Horizontal scrolling preserved
- No width increase on mobile

---

## Title Truncation Behavior

**Before:** Titles truncated at ~140px width
**After:** Titles truncate at ~170px width (30px more text visible)

**Examples:**
- "Sunday - Reserv..." → "Sunday - Reserved B..."
- "Reservation at T..." → "Reservation at The V..."
- "Plumbing Repair for Smith" → "Plumbing Repair for Smith" (fully visible)

---

## Time/Icon Behavior

**Preserved:**
- Type icon: Briefcase, Calendar, CheckCircle
- Time formatting: "9:00 AM – 10:00 PM"
- Icon size: 10px
- Text size: text-[8px] md:text-[9px]
- Layout: Flex row with gap-1

---

## Success Criteria

✓ Desktop quick-stop cards show substantially more of the title
✓ Cards still remain compact (170px max width)
✓ Several cards still fit comfortably in the strip
✓ Icon + full time range preserved
✓ Stop color/number preserved
✓ Mobile remains compact
✓ Horizontal scrolling preserved
✓ Selected card behavior preserved
✓ Click behavior preserved
✓ No autofocus/camera changes