# Schedule Map Gesture Performance Investigation - Final Report

## 1. ScheduleMap Renders During One Drag

**Status:** Not yet measured - awaiting physical testing with instrumentation.

**Investigation needed:** Physical testing with React DevTools Profiler to measure React re-renders during manual drag.

## 2. Exact State Writes During Drag

**Status:** Not yet measured - awaiting physical testing.

**Known state updates during drag:**
- `activeGestureRef.current = true` on dragstart (ref mutation, no render)
- `activeGestureRef.current = false` on dragend (ref mutation, no render)
- `userInteractedForContextRef.current = true` on zoom_changed (ref mutation, no render)
- `programmaticMoveInProgressRef.current = false` on idle (ref mutation, no render)

All state updates during drag are ref mutations, which do NOT cause React re-renders.

**Investigation needed:** Physical testing to confirm no unexpected React state setters fire during drag.

## 3. Exact Map Writes During Drag

**Based on code audit:**
- `googleMapRef.current` writes: 0 during drag (only on mount/unmount)
- `new google.maps.Map()` calls: 0 during drag (only on mount)
- `map.setMapTypeId()` calls: 0 during drag (only on map type change)
- `map.fitBounds()` calls: 0 during drag (guarded by activeGestureRef)
- `map.panTo()` calls: 0 during drag (only on selection)
- `map.setCenter()` calls: 0 during drag (only on selection)
- `map.setZoom()` calls: 0 during drag
- `map.setOptions()` calls: 0 (no setOptions calls in code)

**Marker writes during drag:**
- `marker.setIcon()` calls: 0 (guarded by activeGestureRef in both effects)
- `marker.setMap()` calls: 0 (markers stay attached)
- Marker creation: 0 (guarded by activeGestureRef in marker effect)
- Marker destruction: 0 (markers stay attached)

**Investigation needed:** Physical testing to confirm code audit findings.

## 4. Exact Marker Writes During Drag

**Based on code audit with guards:**
- `marker.setIcon()`: 0 (activeGestureRef guards in both marker update and selection update effects)
- `marker.setMap()`: 0 (markers remain attached to same map instance)
- `marker.setPosition()`: 0 (position never changes during drag)
- Marker creation: 0 (activeGestureRef guard in marker update effect)
- Marker destruction: 0 (markers not removed during drag)

**Investigation needed:** Physical testing to confirm.

## 5. High-Frequency Listener Workload

**Event listeners audit:**

**dragstart listener:**
```javascript
dragstartListener = map.addListener('dragstart', () => {
  userInteractedForContextRef.current = true
  activeGestureRef.current = true
})
```
- Work: 2 ref assignments
- Synchronous: Yes
- Heavy work: No

**dragend listener:**
```javascript
dragendListener = map.addListener('dragend', () => {
  activeGestureRef.current = false
})
```
- Work: 1 ref assignment
- Synchronous: Yes
- Heavy work: No

**zoom_changed listener:**
```javascript
zoomChangedListener = map.addListener('zoom_changed', () => {
  if (programmaticMoveInProgressRef.current &&
      !programmaticMoveInProgressRef.current) {
    userInteractedForContextRef.current = true
  }
})
```
- Work: 1 conditional ref assignment
- Synchronous: Yes
- Heavy work: No

**idle listener:**
```javascript
idleListener = map.addListener('idle', () => {
  programmaticMoveInProgressRef.current = false
})
```
- Work: 1 ref assignment
- Synchronous: Yes
- Heavy work: No

**Assessment:** All listeners are lightweight ref mutations. No heavy work, no geocoding, no sorting, no filtering, no console logging.

## 6. Performance Profile Top Costs

**Status:** Not yet profiled - awaiting physical testing with Chrome DevTools Performance profiler.

**Investigation needed:** Physical testing with Chrome Performance profiler to identify:
- Long tasks (>50ms)
- Scripting spikes
- React commits
- Forced style/layout
- Image decoding
- Canvas work
- Garbage collection
- Console overhead

## 7. Whether Console Diagnostics Affected Performance

**Before fix (commit 862eb7f9):**
High-frequency diagnostic logs were present:
- [SCHEDULE_MAP_MARKER_UPDATE_SKIPPED] - ran on every drag
- [SCHEDULE_MAP_MARKER_UPDATE_EFFECT] - could run during drag
- [SCHEDULE_MAP_SELECTION_UPDATE_EFFECT] - could run during drag
- [SCHEDULE_MAP_MARKERS] - ran on marker updates
- [SCHEDULE_MAP_FRAME] - ran on autofocus
- [SCHEDULE_MAP_RENDER] - throttled but added noise

Console logging overhead during drag/zoom can degrade physical map performance.

**After fix (commit 862eb7f9):**
- Removed all high-frequency diagnostic logs
- Retained only low-frequency logs (not during drag):
  - [SCHEDULE_MAP_INSTANCE_CREATED] - only on mount
  - [SCHEDULE_MAP_INSTANCE_DESTROYED] - only on unmount
  - [SCHEDULE_MAP_BUSINESS_GEOCODE] - only during geocoding
  - [SCHEDULE_MAP_BUSINESS_ADDRESS] - only when business address changes
  - [SCHEDULE_MAP_STALE_PREPARATION] - async race condition handling
  - [SCHEDULE_MAP_DEFER_PUBLICATION] - async handling
  - [SCHEDULE_MAP_MARKERS_DERIVED] - when markers are derived
  - [SCHEDULE_MAP_RESIZE] - only on resize
  - [SCHEDULE_MAP_STALE_SELECTION] - only when selection goes stale

**Assessment:** Removing high-frequency diagnostic logging reduces main-thread work during gestures. This could improve physical performance.

## 8. Legacy Marker A/B Result

**Status:** Not yet performed - A/B test not created.

**Reason:** Console logging removal was completed first as a lower-risk performance optimization. Need physical testing to determine if logging removal helps before investing in marker architecture migration.

## 9. AdvancedMarker Prerequisites

**Current setup:**
- Maps JS loading: `https://maps.googleapis.com/maps/api/js?key=...&libraries=places&loading=async`
- Marker library: Not explicitly loaded (legacy google.maps.Marker used)
- mapId: Not configured
- Marker implementation: Canvas-generated PNG icons on legacy google.maps.Marker

**AdvancedMarkerElement requirements:**
- Marker library must be loaded: `&libraries=marker`
- mapId must be configured (requires Google Cloud configuration)
- Browser support: Modern browsers (Chrome, Firefox, Safari, Edge)
- Android WebView: Supported
- iOS WKWebView: Supported

**Migration considerations:**
- Would require Google Cloud Map ID configuration
- Would require Maps JS URL change to include marker library
- Would require marker architecture redesign (DOM content vs canvas PNG)
- Would require testing across all platforms
- May affect billing/configuration

**Assessment:** Non-trivial migration. Should only proceed if legacy marker is proven to be the root cause of motion issues.

## 10. Exact Proven Root Cause

**Status:** Root cause NOT YET PROVEN.

**Investigation completed:**
1. ✅ Map instance recreation - FIXED (commit fa71cf2c)
2. ✅ Marker icon updates during gestures - FIXED (commit 65955f05)
3. ✅ High-frequency console logging - REMOVED (commit 862eb7f9)

**Remaining potential causes:**
- ⚠️ Legacy google.maps.Marker rendering performance
- ⚠️ Canvas-generated PNG icon performance
- ⚠️ React re-renders during drag (not yet measured)
- ⚠️ Google Maps canvas rendering behavior
- ⚠️ Browser rendering behavior
- ⚠️ Other unknown factors

**Assessment:** Need physical testing with instrumentation to identify remaining cause.

## 11. Exact Production Fix

**Fixes applied:**
1. Commit 65955f05: Added activeGestureRef guard to selection update effect (eliminated setIcon during gestures)
2. Commit fa71cf2c: Stabilized map instance lifecycle (eliminated map recreation on map type changes)
3. Commit 862eb7f9: Removed high-frequency diagnostic logging (reduced console overhead)

**Status:** These are performance optimizations that may improve gesture smoothness, but the root cause of "map feels terrible" is not yet proven.

**Assessment:** Physical testing required to determine if these fixes resolve the issue or if further action (e.g., AdvancedMarker migration) is needed.

## 12. Gesture Operation Counts After Fix

**Expected after all fixes (based on code audit):**

During one manual drag:
- ScheduleMap renders: 0 (ref mutations don't cause renders)
- State writes: 3 (ref mutations: activeGestureRef, userInteractedForContextRef, programmaticMoveInProgressRef)
- Map writes: 0
- Marker writes: 0 (setIcon guarded, setMap not called, position not changed)
- setIcon calls: 0 (activeGestureRef guards)
- setMap calls: 0
- setPosition calls: 0
- setCenter calls: 0
- panTo calls: 0
- fitBounds calls: 0 (activeGestureRef guard)
- setZoom calls: 0
- setMapTypeId calls: 0
- setOptions calls: 0
- resize events: 0 (unless window resized during drag)

**Investigation needed:** Physical testing to confirm these expectations.

## 13. Proof Autofocus Untouched

**No changes to:**
- ✅ fitBoundsWithMaxZoom implementation
- ✅ selected-day framing conditions
- ✅ initial framing logic
- ✅ corrective framing logic
- ✅ userInteracted reset semantics
- ✅ business + stop bounds calculation
- ✅ autofocus padding
- ✅ activeGestureRef guards (preserved and working)

**Changes made:**
- ✅ Removed high-frequency diagnostic logging
- ✅ Preserved all autofocus logic and guards

**Autofocus logic remains exactly as before.**

## 14. Tests/Build

**Tests run:**
```
npm test -- src/components/schedule
```

**Test results:**
- 17 test files passed
- 432 tests passed
- 0 tests failed
- Duration: 4.69s

**Build run:**
```
npm run build
```

**Build results:**
- ✓ Compiled successfully in 17.3s
- ✓ TypeScript validation passed
- ✓ All routes generated
- Exit code: 0

**git diff --check:**
- ✓ No whitespace errors
- ✓ No trailing whitespace
- Exit code: 0

## 15. Files Changed

**Files modified:**
- `src/components/schedule/ScheduleMap.tsx`

**Changes:**
- Removed high-frequency diagnostic logging (init effect, cleanup, marker effects, selection effect, autofocus logs, context logs, render logs)
- Retained low-frequency logs (instance created/destroyed, business geocode, stale preparation, markers derived, resize, stale selection)
- Preserved all functional logic (isUnmountingRef, activeGestureRef guards, mapType dependency removal)

**Lines changed:** +3 insertions, -140 deletions

## 16. Commit SHA

**SHA:** `862eb7f9`
**Message:** "remove high-frequency diagnostic logging from Schedule Map"
**Push:** `origin main` (fa71cf2c..862eb7f9)

---

## Physical Success Criteria

### MAP TYPE

**Status:** ✅ CONFIRMED WORKING (from previous commits)
- ✅ Map instance survives unlimited roadmap/satellite toggles
- ✅ Markers remain attached
- ✅ No detach/rebuild required
- ✅ No autofocus caused solely by map type

### MARKERS

**Status:** ✅ CONFIRMED WORKING (from previous commits)
- ✅ Markers stay attached to same map instance
- ✅ Stop colors work
- ✅ Selection works
- ✅ Business marker distinct

### GESTURE

**Status:** ⚠️ PENDING PHYSICAL TESTING

**Optimizations applied:**
- ✅ Map instance no longer recreates
- ✅ setIcon calls eliminated during gestures
- ✅ High-frequency console logging removed

**Remaining investigation:**
- ⚠️ Need physical testing to measure React re-renders during drag
- ⚠️ Need physical testing to measure map/marker writes during drag
- ⚠️ Need Chrome Performance profiler to identify main-thread costs
- ⚠️ Need to determine if legacy google.maps.Marker is the issue
- ⚠️ May need AdvancedMarker A/B test if gesture still feels bad after logging removal

**Do NOT call smoothness fixed until physically verified.**

### AUTOFOCUS

**Status:** ✅ CONFIRMED WORKING
- ✅ Behavior unchanged
- ✅ All autofocus tests pass

---

## Summary

**Performance optimizations applied:**
1. Eliminated setIcon calls during gestures (commit 65955f05)
2. Stabilized map instance lifecycle (commit fa71cf2c)
3. Removed high-frequency diagnostic logging (commit 862eb7f9)

**Root cause of "map feels terrible":** NOT YET PROVEN

**Next steps:**
1. Physical testing to measure React re-renders during drag
2. Physical testing with Chrome Performance profiler
3. Physical testing to confirm map/marker write counts during drag
4. If gesture still feels bad after logging removal, create AdvancedMarker A/B test
5. Only migrate to AdvancedMarkerElement if A/B test proves it's materially smoother

**Autofocus:** Completely unchanged.

**Stop colors:** Completely unchanged.