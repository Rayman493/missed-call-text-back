# Quick Stop Card Double-Click Zoom - Final Report

## Summary

Added double-click zoom behavior to desktop quick stop cards above the Schedule Map, matching the marker double-click behavior. Reuses the same canonical `focusStopOnMap` helper for consistency.

---

## PART 1 — Exact Implementation

**Canonical Helper Function:**
```typescript
const focusStopOnMap = (itemId: string, latitude: number | null, longitude: number | null) => {
  const targetZoom = 16

  // Select the stop (only if coordinates are valid)
  if (latitude !== null && longitude !== null) {
    selectMapItem(itemId, latitude, longitude)

    // Pan to stop
    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat: latitude, lng: longitude })

      // Zoom in only if current zoom is below target
      const currentZoom = googleMapRef.current.getZoom() ?? 0
      if (currentZoom < targetZoom) {
        googleMapRef.current.setZoom(targetZoom)
      }
    }
  }
}
```

**Marker Double-Click (Updated to use helper):**
```typescript
if (!isBusinessMarker && markerInfo.items.length === 1) {
  marker.addListener('dblclick', () => {
    const item = markerInfo.items[0]
    focusStopOnMap(item.id, item.latitude, item.longitude)
  })
}
```

**Quick Stop Card Double-Click (Desktop):**
```typescript
<button
  onClick={() => selectMapItem(item.id, item.latitude, item.longitude)}
  onDoubleClick={() => {
    // Only add zoom behavior for stop markers (not business)
    if (item.type !== 'business') {
      focusStopOnMap(item.id, item.latitude, item.longitude)
    }
  }}
  className="..."
>
```

---

## PART 2 — Marker/Card Share Canonical Focus Logic

**Yes, marker and card share the same canonical logic:**
- Both use the `focusStopOnMap` helper function
- Both implement the same zoom rule (target zoom 16)
- Both handle missing coordinates safely
- Both exclude business markers from zoom behavior

**Benefits:**
- Single source of truth for focus behavior
- Consistent zoom logic across interactions
- Easier to maintain and update
- No drift between implementations

---

## PART 3 — Single-Click Behavior

**Preserved Exactly:**
```typescript
onClick={() => selectMapItem(item.id, item.latitude, item.longitude)}
```

- Selects the stop
- Updates detail card
- Preserves existing selection behavior
- No changes to single-click logic

---

## PART 4 — Double-Click Behavior

**Desktop Quick Stop Cards:**
- Selects the stop
- Pans to stop coordinates
- Zooms to target zoom 16 if current zoom < 16
- Does NOT zoom if current zoom >= 16
- Only applies to stop markers (not business marker)
- Detail card remains synchronized

**Marker Double-Click:**
- Same behavior (uses same helper)

---

## PART 5 — Zoom Rule

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
- Prevents jarring zoom reset or zoom out

---

## PART 6 — Missing-Coordinate Behavior

**Safe Handling:**
```typescript
if (latitude !== null && longitude !== null) {
  selectMapItem(itemId, latitude, longitude)
  // ... pan and zoom
}
```

**Behavior:**
- If coordinates are null, no operation performed
- No error thrown
- No broken pan/zoom attempt
- Selection does NOT occur (requires valid coordinates)

---

## PART 7 — Desktop Behavior

**Implemented:**
- ✓ Double-click on quick stop card triggers focus and zoom
- ✓ Single-click behavior preserved
- ✓ Horizontal scrolling still works
- ✓ Card selected state still works
- ✓ Title/time/icon layout unchanged
- ✓ Business marker excluded from zoom behavior

---

## PART 8 — Mobile Behavior

**NOT Implemented:**
- No double-click handler added to mobile stop cards

**Rationale:**
- Double-click is primarily a desktop mouse behavior
- Mobile has pinch zoom and single-tap selection
- Avoids interference with touch interactions
- No custom touch timing logic needed

**Mobile Behavior:**
- Single-tap selection unchanged
- Horizontal scrolling still works
- Touch interactions preserved

---

## PART 9 — Autofocus Safety

**No Changes To:**
- ✓ fitBoundsWithMaxZoom
- ✓ Initial framing
- ✓ Selected-day framing
- ✓ Corrective framing
- ✓ Business + stop bounds
- ✓ userInteracted reset behavior
- ✓ Date-change behavior

**Only Changes:**
- Added canonical `focusStopOnMap` helper
- Added double-click handler to desktop quick stop cards
- Updated marker double-click to use helper

**Autofocus behavior is identical.**

---

## PART 10 — Tests/Build

**Tests Run:**
- 24 ScheduleMap tests passed
- Production build successful
- TypeScript validation passed

---

## PART 11 — Files Changed

1. **src/components/schedule/ScheduleMap.tsx**
   - Added canonical `focusStopOnMap` helper function
   - Updated marker double-click to use helper
   - Added `onDoubleClick` handler to desktop quick stop cards
   - Mobile quick stop cards unchanged (no double-click)

**Lines Changed:**
- Lines 300-319: Added canonical `focusStopOnMap` helper
- Lines 1856-1862: Updated marker double-click to use helper
- Lines 2350-2372: Added `onDoubleClick` to desktop quick stop cards

---

## PART 12 — Commit SHA

`89cee0f7` - "add quick stop card double-click zoom"

---

## PART 13 — Success Criteria

**Desktop:**

✓ **Single-click quick stop card**
→ Normal selection (preserved)

✓ **Double-click quick stop card**
→ Select stop
→ Center/pan to stop
→ Zoom to 16 if currently farther out
→ No zoom if already at or above 16

✓ **Matches marker double-click interaction exactly**
→ Both use same `focusStopOnMap` helper
→ Consistent behavior across interactions

**NO OTHER MAP CHANGES:**
- ✓ VECTOR configuration unchanged
- ✓ CSP unchanged
- ✓ Map initialization unchanged
- ✓ Autofocus unchanged
- ✓ Initial framing unchanged
- ✓ Selected-day framing unchanged
- ✓ userInteracted semantics unchanged
- ✓ Marker rendering unchanged
- ✓ Map type switching unchanged
- ✓ Quick-card visual design unchanged

---

## Conclusion

Successfully added double-click zoom to desktop quick stop cards, reusing the same canonical focus logic as marker double-click for consistency. Single-click behavior is preserved, mobile behavior is unchanged, and all autofocus logic is untouched.