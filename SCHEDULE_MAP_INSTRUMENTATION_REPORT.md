# Schedule Map Gesture Performance Instrumentation - Final Report

## 1. React Renders During 5-Second Drag

**Status:** Not yet measured - instrumentation added, awaiting physical testing.

**Instrumentation added:**
- `renderCountRef.current` - Total component renders
- `gestureRenderCountRef.current` - Renders during active gestures (drag/zoom)
- Counter increments when `activeGestureRef.current` is true

**How to measure:**
```javascript
// In browser console
window.__scheduleMapPerf.resetCounters()
// Perform 5-second drag
console.log('Gesture renders:', window.__scheduleMapPerf.getGestureRenderCount())
```

**Expected if good:** 0 renders during drag
**Expected if bad:** > 0 renders indicates React churn

## 2. Exact State/Prop Causes

**Status:** Not yet measured - awaiting physical testing with React DevTools Profiler.

**How to measure:**
1. Open React DevTools Profiler
2. Record during drag
3. Identify which components commit and why

**Investigation needed:** Physical testing with React Profiler.

## 3. Exact Map Operation Counts

**Status:** Instrumentation added, awaiting physical testing.

**Counters added:**
- `mapCreate` - Count of google.maps.Map() calls
- `mapSetCenter` - Count of map.setCenter() calls
- `mapPanTo` - Count of map.panTo() calls
- `mapFitBounds` - Count of map.fitBounds() calls
- `mapSetZoom` - Count of map.setZoom() calls
- `mapSetOptions` - Count of map.setOptions() calls

**How to measure:**
```javascript
window.__scheduleMapPerf.resetCounters()
// Perform drag
console.log('Map ops:', window.__scheduleMapPerf.getOpCounters())
```

**Expected during drag:** 0 for all map operations

## 4. Exact Marker Operation Counts

**Status:** Instrumentation added, awaiting physical testing.

**Counters added:**
- `markerCreate` - Count of marker creation
- `markerSetMap` - Count of marker.setMap() calls
- `markerSetIcon` - Count of marker.setIcon() calls
- `markerSetPosition` - Count of marker.setPosition() calls
- `markerCleanup` - Count of marker cleanup operations

**How to measure:**
```javascript
window.__scheduleMapPerf.resetCounters()
// Perform drag
console.log('Marker ops:', window.__scheduleMapPerf.getOpCounters())
```

**Expected during drag:** 0 for all marker operations (guarded by activeGestureRef)

## 5. Chrome Performance Top Costs

**Status:** Not yet measured - awaiting physical testing with Chrome DevTools.

**How to measure:**
1. Open Chrome DevTools Performance tab
2. Record: 2s idle → 5s drag → 2s idle → zoom in → zoom out
3. Analyze top 10 costs by duration during drag window

**Investigation needed:** Physical testing with Chrome Performance profiler.

## 6. React Profiler Result

**Status:** Not yet measured - awaiting physical testing.

**How to measure:**
1. Open React DevTools Profiler tab
2. Record during drag
3. Analyze commits, components, render reasons

**Investigation needed:** Physical testing with React Profiler.

## 7. DevicePixelRatio/Canvas Scaling Findings

**Current implementation:**
- Canvas scale: 2 (hardcoded in createNumberedMarkerIcon)
- Canvas dimensions: size * scale (e.g., 72x72 for 36px marker)
- Display size: size (36px or 44px)
- Device pixel ratio: Varies by device

**Exposure added:**
```javascript
window.__scheduleMapPerf.getDevicePixelRatio() // Browser DPR
window.__scheduleMapPerf.getCanvasScale() // Canvas scale (2)
```

**How to measure:**
```javascript
console.log('DPR:', window.__scheduleMapPerf.getDevicePixelRatio())
console.log('Canvas scale:', window.__scheduleMapPerf.getCanvasScale())
```

**Investigation needed:** Physical testing to check if canvas scale matches device pixel ratio. If scale > DPR, canvas is being downscaled (can cause blur). If scale < DPR, canvas is being upscaled (can cause pixelation).

## 8. Map Rendering Mode

**Current configuration:**
- Map type: Roadmap or Hybrid (satellite)
- No mapId configured
- No explicit renderingType set
- gestureHandling: default ('cooperative')

**Investigation needed:** Physical testing to determine if current setup forces raster behavior vs vector rendering.

## 9. Legacy Marker A/B Result

**Status:** Not yet performed - A/B test not created.

**Reason:** Instrumentation added first to identify if ReplyFlow code is the issue. A/B test only if React/main-thread profile shows no ReplyFlow churn.

**A/B test plan:**
- Create temporary test component
- Render legacy Marker + canvas PNG vs AdvancedMarker + simple DOM
- Test at nearby fixed coordinates
- Compare visual locking, lag/swim, perceived smoothness

## 10. Canvas-Icon A/B Result

**Status:** Not yet performed - A/B test not created.

**Reason:** Instrumentation added first. A/B test only if marker API is identified as issue.

**A/B test plan:**
- Compare Legacy Marker + canvas PNG vs Legacy Marker + simple icon vs AdvancedMarker + DOM
- Isolate whether issue is marker API, canvas icon, or map rendering

## 11. AdvancedMarker Viability

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

**Assessment:** Non-trivial migration. Should only proceed if legacy marker is proven to be the root cause.

## 12. Exact Proven Root Cause

**Status:** Root cause NOT YET PROVEN.

**Investigation completed:**
1. ✅ Map instance recreation - FIXED (commit fa71cf2c)
2. ✅ Marker icon updates during gestures - FIXED (commit 65955f05)
3. ✅ High-frequency console logging - REMOVED (commit 862eb7f9)
4. ✅ Performance instrumentation - ADDED (commit 869b4ea9)

**Remaining potential causes:**
- ⚠️ React re-renders during drag (not yet measured)
- ⚠️ Legacy google.maps.Marker rendering performance
- ⚠️ Canvas-generated PNG icon performance
- ⚠️ Canvas scaling mismatch with device pixel ratio
- ⚠️ Google Maps canvas rendering behavior
- ⚠️ Browser rendering behavior
- ⚠️ Map rendering mode (raster vs vector)
- ⚠️ Other unknown factors

**Assessment:** Need physical testing with instrumentation to identify remaining cause.

## 13. Exact Production Fix

**Fixes applied:**
1. Commit 65955f05: Added activeGestureRef guard to selection update effect (eliminated setIcon during gestures)
2. Commit fa71cf2c: Stabilized map instance lifecycle (eliminated map recreation on map type changes)
3. Commit 862eb7f9: Removed high-frequency diagnostic logging (reduced console overhead)
4. Commit 869b4ea9: Added performance instrumentation (enables data-driven investigation)

**Status:** These are performance optimizations and instrumentation that enable investigation, but the root cause of "map feels terrible" is not yet proven.

**No speculative fixes applied.** All changes are based on code audit evidence.

**Assessment:** Physical testing required with instrumentation to identify root cause before any additional fixes.

## 14. Proof Autofocus Untouched

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
- ✅ Added render counters
- ✅ Added operation counters
- ✅ Exposed performance API to browser console
- ✅ Added device pixel ratio exposure
- ✅ Preserved all autofocus logic and guards

**Autofocus logic remains exactly as before.**

## 15. Tests/Build

**Tests run:**
```
npm test -- src/components/schedule
```

**Test results:**
- 17 test files passed
- 432 tests passed
- 0 tests failed
- Duration: 4.64s

**Build run:**
```
npm run build
```

**Build results:**
- ✓ Compiled successfully in 19.1s
- ✓ TypeScript validation passed
- ✓ All routes generated
- Exit code: 0

**git diff --check:**
- ✓ No whitespace errors
- ✓ No trailing whitespace
- Exit code: 0

## 16. Commit SHA

**SHA:** `869b4ea9`
**Message:** "add Schedule Map gesture performance instrumentation"
**Push:** `origin main` (862eb7f9..869b4ea9)

---

## Files Changed

**Files modified:**
- `src/components/schedule/ScheduleMap.tsx` - Added render counters, operation counters, browser console API
- `SCHEDULE_MAP_PERFORMANCE_MEASUREMENT_GUIDE.md` - Created comprehensive measurement guide

**Lines changed:** +327 insertions, -1 deletion

---

## Physical Success Criteria

### MAP TYPE

**Status:** ✅ CONFIRMED WORKING (from previous commits)
- ✅ Map instance survives unlimited roadmap/satellite toggles
- ✅ Markers remain attached
- ✅ No detach/rebuild required

### MARKERS

**Status:** ✅ CONFIRMED WORKING (from previous commits)
- ✅ Markers stay attached to same map instance
- ✅ Stop colors work
- ✅ Selection works
- ✅ Business marker distinct

### GESTURE

**Status:** ⚠️ PENDING PHYSICAL TESTING WITH INSTRUMENTATION

**Instrumentation added:**
- ✅ Render counters to measure React re-renders during drag
- ✅ Operation counters to measure map/marker writes during drag
- ✅ Browser console API for easy inspection
- ✅ Device pixel ratio exposure for canvas scaling analysis

**Next steps for physical testing:**
1. Use browser console API to measure render counts during drag
2. Use browser console API to measure operation counts during drag
3. Use Chrome Performance profiler to identify main-thread costs
4. Use React Profiler to identify component commits
5. Analyze canvas scaling vs device pixel ratio
6. If no ReplyFlow churn found, create AdvancedMarker A/B test
7. If marker API is issue, create canvas-icon A/B test

**Do NOT call smoothness fixed until physically verified.**

### AUTOFOCUS

**Status:** ✅ CONFIRMED WORKING
- ✅ Behavior unchanged
- ✅ All autofocus tests pass

---

## Summary

**Performance instrumentation added:**
- Render counters to identify React re-renders during gestures
- Operation counters to identify map/marker writes during gestures
- Browser console API for easy inspection during physical testing
- Device pixel ratio exposure for canvas scaling analysis
- Comprehensive measurement guide for systematic data collection

**Root cause of "map feels terrible":** NOT YET PROVEN

**Approach:** Data-driven investigation using instrumentation. No speculative fixes applied.

**Next steps:**
1. Physical testing with browser console API to measure render/operation counts
2. Physical testing with Chrome Performance profiler to identify main-thread costs
3. Physical testing with React Profiler to identify component commits
4. Physical testing to analyze canvas scaling vs device pixel ratio
5. Only create A/B tests if instrumentation shows no ReplyFlow churn
6. Only migrate to AdvancedMarkerElement if A/B test proves it's materially smoother

**Autofocus:** Completely unchanged.

**Stop colors:** Completely unchanged.

**Key principle:** Do not apply another speculative fix. Capture authoritative runtime performance evidence first, then fix the proven bottleneck.