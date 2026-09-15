# Schedule Map Diagnostic Logging Enhancement Report

## Summary

Added enhanced diagnostic logging to ScheduleMap to help identify the root cause of poor manual navigation feel during physical testing. The logging tracks renders, operations, and ResizeObserver callbacks during gestures.

---

## PART 1 — Enhanced Performance Counters

**Added Diagnostic Features:**

1. **Operation Timestamp Tracking:**
   - New ref: `opTimestampsRef` - tracks all operations with timestamps and gesture context
   - Helper function: `logOperation(operation)` - logs operation with timestamp and whether it occurred during active gesture
   - Warns in console when operations occur during active gestures

2. **Render Tracking During Gestures:**
   - Enhanced render counter to log timestamp and render count when renders occur during gestures
   - Console warning: `[SCHEDULE_MAP_RENDER_DURING_GESTURE]` with timestamp, map instance, and render count

3. **Post-Drag Operation Tracking:**
   - Enhanced dragend listener to log dragend timestamp
   - Tracks operations in the 500ms window after dragend
   - Console warning: `[SCHEDULE_MAP_POST_DRAG_OPS]` if operations occur immediately after drag release

4. **ResizeObserver Gesture Detection:**
   - Enhanced ResizeObserver to detect when callbacks fire during active gestures
   - Console warning: `[SCHEDULE_MAP_RESIZE_DURING_GESTURE]` if resize occurs during drag
   - Logs old size, new size, and whether it happened during gesture

5. **Operation Logging:**
   - Added `logOperation()` calls to:
     - `mapCreate`
     - `markerCreate`
     - `markerSetIcon` (both in main marker update and selection update)

---

## PART 2 — New Diagnostic API

**Enhanced `window.__scheduleMapPerf` API:**

```javascript
window.__scheduleMapPerf = {
  getRenderCount: () => renderCountRef.current,
  getGestureRenderCount: () => gestureRenderCountRef.current,
  getOpCounters: () => ({ ...opCountersRef.current }),
  getOpTimestamps: () => [...opTimestampsRef.current],  // NEW
  getOpsDuringGesture: () => opTimestampsRef.current.filter(op => op.duringGesture),  // NEW
  resetCounters: () => { ... },
  getActiveGesture: () => activeGestureRef.current,
  getMapInstance: () => mapInstanceIdRef.current,
  getMarkerCount: () => markersRef.current.size,
  getDevicePixelRatio: () => window.devicePixelRatio,
  getCanvasScale: () => window.devicePixelRatio || 1
}
```

**New Methods:**
- `getOpTimestamps()` - Returns array of all operations with timestamps and gesture context
- `getOpsDuringGesture()` - Returns only operations that occurred during active gestures
- `resetCounters()` - Now also clears operation timestamps

---

## PART 3 — Physical Testing Instructions

**Step 1: Reset Counters**
```javascript
window.__scheduleMapPerf.resetCounters()
```

**Step 2: Perform 5-Second Drag**
- Slow drag
- Fast drag
- Diagonal drag

**Step 3: Capture Results**
```javascript
window.__scheduleMapPerf.getGestureRenderCount()
window.__scheduleMapPerf.getRenderCount()
window.__scheduleMapPerf.getOpCounters()
window.__scheduleMapPerf.getOpsDuringGesture()
```

**Step 4: Check Console Warnings**
Look for console warnings:
- `[SCHEDULE_MAP_RENDER_DURING_GESTURE]` - React rendering during drag
- `[SCHEDULE_MAP_OP_DURING_GESTURE]` - Map/marker operations during drag
- `[SCHEDULE_MAP_RESIZE_DURING_GESTURE]` - ResizeObserver during drag
- `[SCHEDULE_MAP_POST_DRAG_OPS]` - Operations after drag release

---

## PART 4 — Operation Counters Tracked

**Existing Counters:**
- mapCreate
- markerCreate
- markerSetMap
- markerSetIcon
- markerSetPosition
- mapSetCenter
- mapPanTo
- mapFitBounds
- mapSetZoom
- mapSetOptions
- markerCleanup

**New Logging:**
- `mapCreate` - Logged with timestamp and gesture context
- `markerCreate` - Logged with timestamp and gesture context
- `markerSetIcon` - Logged with timestamp and gesture context (both main and selection update)

---

## PART 5 — ResizeObserver Audit

**Enhanced Logging:**
```javascript
console.log('[SCHEDULE_MAP_RESIZE]', {
  old: `${lastSize.width}x${lastSize.height}`,
  new: `${width}x${height}`,
  reason: 'container_resize',
  mapInstance: mapInstanceIdRef.current,
  duringGesture,  // NEW
  timestamp: Date.now()
})
```

If `duringGesture` is true, a warning is logged:
```javascript
console.warn('[SCHEDULE_MAP_RESIZE_DURING_GESTURE]', 'ResizeObserver fired during active gesture - this may cause rubber-band feel')
```

**Physical Test:**
During a drag, check if any resize warnings appear. If yes, the ResizeObserver is triggering during gesture and could cause the rubber-band feel.

---

## PART 6 — Post-Drag Catch-Up Trace

**Enhanced dragend Listener:**
```javascript
dragendListener = map.addListener('dragend', () => {
  const dragEndTime = Date.now()
  console.log('[SCHEDULE_MAP_DRAGEND]', {
    timestamp: dragEndTime,
    mapInstance: mapInstanceIdRef.current
  })
  // ... set activeGestureRef.current = false

  // Track operations in the next 500ms after dragend
  setTimeout(() => {
    const opsAfterDrag = opTimestampsRef.current.filter(op =>
      op.timestamp >= dragEndTime && op.timestamp < dragEndTime + 500
    )
    if (opsAfterDrag.length > 0) {
      console.warn('[SCHEDULE_MAP_POST_DRAG_OPS]', {
        count: opsAfterDrag.length,
        operations: opsAfterDrag,
        mapInstance: mapInstanceIdRef.current
      })
    }
  }, 500)
})
```

**Physical Test:**
After releasing drag, check console for `[SCHEDULE_MAP_POST_DRAG_OPS]` warning. If operations occur immediately after release, they could create perceived catch-up/rubber-band feel.

---

## PART 7 — Render Source Identification

**Enhanced Render Tracking:**
```javascript
renderCountRef.current++
const renderTimestamp = Date.now()
if (activeGestureRef.current) {
  gestureRenderCountRef.current++
  console.warn('[SCHEDULE_MAP_RENDER_DURING_GESTURE]', {
    timestamp: renderTimestamp,
    mapInstance: mapInstanceIdRef.current,
    renderCount: renderCountRef.current
  })
}
```

**Physical Test:**
If renders occur during drag, check:
- How many renders occur
- At what timestamps
- Whether they correlate with specific user actions

To identify the exact render source, you would need to add React DevTools Profiler or stack trace logging (not added in this change).

---

## PART 8 — Current Guards (Preserved)

**Existing Guards (Not Changed):**
- Marker updates guarded during gestures (line 1768)
- Icon updates guarded during gestures (line 1953)
- These guards remain in place and are important

**Purpose of Diagnostic Logging:**
The diagnostic logging is designed to verify that these guards are working and to identify if OTHER operations (not guarded) are occurring during gestures.

---

## PART 9 — Files Changed

1. `src/components/schedule/ScheduleMap.tsx`
   - Added `opTimestampsRef` for operation timestamp tracking
   - Added `logOperation()` helper function
   - Enhanced render tracking to log during gestures
   - Enhanced ResizeObserver to detect during-gesture callbacks
   - Enhanced dragend listener to track post-drag operations
   - Added `logOperation()` calls to mapCreate, markerCreate, markerSetIcon
   - Enhanced `window.__scheduleMapPerf` API with new methods

**Lines Changed:**
- Lines 198-213: Added operation timestamp tracking and logOperation helper
- Lines 303-314: Enhanced render tracking during gestures
- Lines 1635-1650: Enhanced ResizeObserver logging
- Lines 1512-1532: Enhanced dragend listener with post-drag tracking
- Lines 1501-1503: Added logging to mapCreate
- Lines 1790-1793: Added logging to markerSetIcon
- Lines 1935-1951: Enhanced performance counter API
- Lines 2042-2045: Added logging to selection markerSetIcon

---

## PART 10 — Tests/Build

**Tests Run:**
- 24 ScheduleMap tests passed
- Production build successful
- TypeScript validation passed

---

## PART 11 — Commit SHA

`c530e447` - "add Schedule Map diagnostic logging for gesture performance investigation"

---

## PART 12 — Next Steps for Physical Testing

**Required Physical Testing:**

1. **Baseline Measurement:**
   ```javascript
   window.__scheduleMapPerf.resetCounters()
   // Perform 5-second drag
   window.__scheduleMapPerf.getGestureRenderCount()
   window.__scheduleMapPerf.getOpsDuringGesture()
   ```

2. **Check Console Warnings:**
   - Any `[SCHEDULE_MAP_RENDER_DURING_GESTURE]`?
   - Any `[SCHEDULE_MAP_OP_DURING_GESTURE]`?
   - Any `[SCHEDULE_MAP_RESIZE_DURING_GESTURE]`?
   - Any `[SCHEDULE_MAP_POST_DRAG_OPS]`?

3. **Interpret Results:**
   - If `gestureRenderCount > 0`: React is rendering during drag → investigate render source
   - If `getOpsDuringGesture().length > 0`: Operations occurring during drag → investigate which operations
   - If resize during gesture: ResizeObserver triggering → investigate layout stability
   - If post-drag ops: Operations after release → investigate catch-up timing

4. **Parent CSS Audit:**
   If no app-side operations during drag, inspect parent components for:
   - backdrop-blur
   - filter
   - transform
   - will-change
   - These can cause compositor overhead even without React renders

5. **Chrome Performance Trace:**
   If counters are clean, capture Chrome Performance trace to identify browser/renderer bottlenecks

---

## PART 13 — No Production Fix Yet

**Status:**
This commit adds diagnostic logging only. NO production fix has been implemented.

**Reason:**
The root cause of poor manual navigation feel has not yet been identified. The diagnostic logging will help identify the actual bottleneck during physical testing.

**Next Action:**
Perform physical testing using the enhanced diagnostics, then implement a targeted fix based on the findings.

---

## PART 14 — Autofocus Preserved

**No Changes To:**
- fitBoundsWithMaxZoom
- Initial framing
- Selected-day framing
- Corrective framing
- userInteracted semantics
- Map type logic
- Marker colors
- Quick stop cards
- Customer flows
- Tap to Pay

**Only Changes:**
- Diagnostic logging for performance investigation

---

## SUCCESS CRITERIA FOR NEXT STEP

The diagnostic logging will help identify:
- Whether React renders during drag (and how many)
- Which map/marker operations occur during drag
- Whether ResizeObserver triggers during drag
- Whether operations occur immediately after drag release
- Exact timing of operations

This information will guide the next step to identify and fix the actual root cause of poor manual navigation feel.