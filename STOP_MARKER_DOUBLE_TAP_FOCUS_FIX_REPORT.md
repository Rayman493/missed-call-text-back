# Stop Marker Double-Tap Focus Behavior Fix - Final Report

## Summary

Fixed mobile stop marker double-tap behavior to work regardless of selection state. Previously, markers had to be selected first before double-tap would zoom. Now, double-tap immediately selects, pans, and zooms to the stop marker even when unselected.

---

## PART 1 — Exact Root Cause

**Previous Implementation:**
- Used Google Maps native `dblclick` event for double-click zoom
- Google Maps `dblclick` event does not fire reliably on mobile touch devices
- Mobile touch devices use different gesture recognition than mouse events
- On mobile, double-tap might not trigger the `dblclick` listener
- This caused the requirement to first select the marker, then double-tap again

**Issue:**
The `dblclick` event is mouse-centric and not guaranteed to fire on mobile touch devices. Mobile browsers and Google Maps handle touch gestures differently than mouse events.

---

## PART 2 — Previous Selection Dependency

**Previous Flow:**
1. First tap: `click` event fires → `selectMapItem` → marker selected
2. Second tap: `dblclick` event might not fire → no zoom
3. User had to wait or tap again to trigger zoom

**Dependency:**
The zoom behavior depended on the `dblclick` event firing, which was unreliable on mobile. This created a de facto dependency on the marker being selected first because single-tap selection always worked reliably.

---

## PART 3 — New Double-Activation Behavior

**Implementation: Custom Double-Tap Detection**

```typescript
const lastClickTimeRef = useRef<Map<string, number>>(new Map())
const DOUBLE_TAP_DELAY_MS = 300

marker.addListener('click', () => {
  const item = markerInfo.items[0]
  const now = Date.now()
  const lastClick = lastClickTimeRef.current.get(item.id) ?? 0
  const timeSinceLastClick = now - lastClick

  if (timeSinceLastClick < DOUBLE_TAP_DELAY_MS) {
    // Double-tap: focus on map (select + pan + zoom)
    focusStopOnMap(item.id, item.latitude, item.longitude)
    lastClickTimeRef.current.delete(item.id) // Reset to prevent triple-tap
  } else {
    // Single-tap: just select
    selectMapItem(item.id, item.latitude, item.longitude)
    lastClickTimeRef.current.set(item.id, now)
  }
})
```

**Behavior:**
- Tracks last click time per marker ID
- If two clicks happen within 300ms: treat as double-tap → select + pan + zoom
- Otherwise: treat as single-tap → just select
- Works consistently on both desktop (mouse) and mobile (touch)
- No delay added to single-tap behavior

---

## PART 4 — Mobile Event Path

**Mobile Touch Path:**
1. First tap: `click` event fires → select marker → record timestamp
2. Second tap (within 300ms): `click` event fires → detect double-tap → call `focusStopOnMap` → select + pan + zoom

**Desktop Mouse Path:**
1. First click: `click` event fires → select marker → record timestamp
2. Second click (within 300ms): `click` event fires → detect double-tap → call `focusStopOnMap` → select + pan + zoom

**Fallback:**
Native `dblclick` listener still present as a fallback for desktop browsers that prefer native dblclick events.

**No Global Touch Listeners:**
- Tracking is scoped to marker IDs (per-marker state)
- No global touch event listeners
- No interference with map pinch zoom
- No interference with map pan gestures

---

## PART 5 — Desktop Preservation

**Desktop Behavior Preserved:**
- ✓ Single-click: selects marker
- ✓ Double-click: selects + pans + zoomes
- ✓ Quick-stop card double-click: unchanged (uses onDoubleClick)
- ✓ Native dblclick fallback still present

**Consistency:**
Desktop now uses the same timing-based double-tap detection as mobile, ensuring consistent behavior across platforms.

---

## PART 6 — Single Tap Preservation

**Single-Tap Behavior:**
- ✓ No delay added to single-tap
- ✓ Immediate selection on first tap
- ✓ No artificial delays to distinguish click/double-click
- ✓ Fast normal tap behavior preserved

**Event Order Acceptable:**
First tap selects, second tap (within 300ms) triggers focus. This is the expected behavior and feels natural to users.

---

## PART 7 — Zoom Rule

**Target Zoom:**
- 16

**Behavior:**
```typescript
const targetZoom = 16
const currentZoom = googleMapRef.current.getZoom() ?? 0

if (currentZoom < targetZoom) {
  googleMapRef.current.setZoom(targetZoom)
}
```

**Logic:**
- If current zoom < 16: pan to stop + zoom to 16
- If current zoom >= 16: pan to stop only (no zoom out)
- Never zoom outward

---

## PART 8 — Autofocus Proof

**No Changes To:**
- ✓ fitBoundsWithMaxZoom
- ✓ Initial framing
- ✓ Selected-day framing
- ✓ Corrective framing
- ✓ userInteracted reset semantics
- ✓ Date-change camera behavior
- ✓ Existing panToMarker logic

**Only Changes:**
- Added `lastClickTimeRef` for double-tap detection
- Updated marker click handler to detect double-taps
- Kept native dblclick as fallback

**Autofocus behavior is identical.**

---

## PART 9 — Tests/Build

**Tests Run:**
- 24 ScheduleMap tests passed
- Production build successful
- TypeScript validation passed

---

## PART 10 — Files Changed

1. **src/components/schedule/ScheduleMap.tsx**
   - Added `lastClickTimeRef` for per-marker click timing
   - Added `DOUBLE_TAP_DELAY_MS` constant (300ms)
   - Updated marker click handler to detect double-taps
   - Kept native dblclick listener as fallback

**Lines Changed:**
- Lines 294-299: Added double-tap detection refs and constants
- Lines 1842-1882: Updated marker click handler with double-tap detection
- Lines 1884-1889: Kept native dblclick fallback

---

## PART 11 — Commit SHA

`1178da99` - "fix stop marker double-tap focus behavior"

---

## PART 12 — Success Criteria

**On Mobile:**

✓ **Double-tap an UNSELECTED stop marker**
→ Immediately selects
→ Pans to the stop
→ Zooms to 16 if needed

✓ **No separate first-selection step required**
→ Works from unselected state
→ Works from selected state
→ Consistent behavior

**On Desktop:**

✓ **Single-click**
→ Selects marker

✓ **Double-click**
→ Selects + pans + zooms

**NO REGRESSIONS:**
- ✓ Business marker behavior unchanged
- ✓ Quick-stop card double-click unchanged
- ✓ Autofocus behavior unchanged
- ✓ Map gestures (pinch, pan) unchanged

---

## Conclusion

Fixed mobile stop marker double-tap behavior by implementing custom double-tap detection that works consistently on both desktop and mobile. The marker no longer needs to be selected first before double-tapping to zoom. Single-tap behavior remains fast with no delays, and all autofocus logic is untouched.