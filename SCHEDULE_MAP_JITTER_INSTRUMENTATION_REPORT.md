# Schedule Map Jitter Instrumentation Report

## Overview

Added comprehensive runtime instrumentation to the ScheduleMap component to identify the actual source of physical camera jitter during manual pan/zoom operations.

## Instrumentation Added

### 1. Map Instance Tracking

**Purpose:** Detect if React is destroying/recreating the Google Maps Map instance during interaction.

**Logs:**
```
[SCHEDULE_MAP_INSTANCE_CREATED]
id=map-<counter>-<timestamp>
timestamp=...

[SCHEDULE_MAP_INSTANCE_DESTROYED]
id=...
timestamp=...
```

**Location:** Lines 1057-1058, 1567-1573 in ScheduleMap.tsx

**What to look for:**
- If multiple `[SCHEDULE_MAP_INSTANCE_CREATED]` logs appear during a single session, the map is being recreated
- Map recreation will cause visual jumps and roughness
- Check if recreation correlates with drag, zoom, or other events

---

### 2. Camera State Logging

**Purpose:** Track actual camera values (center, zoom, bounds) for all map events to detect unexpected camera movements.

**Logs:**
```
[SCHEDULE_MAP_CAMERA_STATE]
event=<dragstart|drag|dragend|zoom_changed|center_changed|bounds_changed|idle>
reason=<...>
center=<lat,lng>
zoom=<value>
mapInstance=<id>
container=<WxH>
deltaInfo=<deltaLat=... deltaLng=... deltaZoom=...>
userInteracted=<true/false>
timestamp=...
```

**Location:** Lines 335-362 in ScheduleMap.tsx

**What to look for:**
- `deltaLat`, `deltaLng`, `deltaZoom` should correspond only to user gesture
- If camera changes occur without corresponding user events, it's a programmatic move
- Large deltas in `idle` event indicate camera moved after gesture settled
- Check if `center_changed` or `bounds_changed` fires without `drag` events

---

### 3. Camera Command Logging

**Purpose:** Log EVERY direct or indirect camera mutation to identify the source of unwanted camera moves.

**Logs:**
```
[SCHEDULE_MAP_CAMERA_COMMAND]
source=<exact function/effect>
command=<fitBounds|panTo|setCenter|setZoom|etc>
center=<...>
zoom=<...>
reason=<...>
userInteracted=<true/false>
mapInstance=<id>
timestamp=...
```

**Location:** Lines 364-376, 435-442, 478-485, 1278-1285 in ScheduleMap.tsx

**Instrumented commands:**
- `fitBoundsWithMaxZoom` → `fitBounds`
- `panToMarker` → `panTo`
- `date_state_restoration` → `setCenter+setZoom`

**What to look for:**
- Any `[SCHEDULE_MAP_CAMERA_COMMAND]` during manual drag/zoom
- Commands with `userInteracted=true` during user gesture (should not happen)
- Commands from `date_state_restoration` during interaction (feedback loop)
- Commands from `marker_update_effect` during interaction

---

### 4. React Render Logging

**Purpose:** Track component re-renders to identify if React state updates are causing excessive renders during interaction.

**Logs:**
```
[SCHEDULE_MAP_RENDER]
count=<N>
mapInstance=<id>
mapReady=<true/false>
jobsCount=<N>
eventsCount=<N>
tasksCount=<N>
selectedDate=<ISO>
mapItemsCount=<N>
userInteracted=<true/false>
showAllMode=<true/false>
mapFilter=<all|jobs|appointments>
```

**Location:** Lines 207-231 in ScheduleMap.tsx

**What to look for:**
- Rapid render count increase during manual drag (e.g., count jumps from 10 to 50 in seconds)
- Renders should be throttled (logged every 5th render)
- If renders spike during drag, check which state is updating (userInteracted, etc.)
- Excessive renders can cause performance issues and perceived roughness

---

### 5. Marker Lifecycle Logging

**Purpose:** Track marker creation/removal to detect if markers are being recreated excessively during interaction.

**Logs:**
```
[SCHEDULE_MAP_MARKERS]
created=<N>
removed=<N>
total=<N>
reason=<marker_update_effect>
mapInstance=<id>
```

**Location:** Lines 1355-1369 in ScheduleMap.tsx

**What to look for:**
- Marker recreation during manual drag (should be zero during interaction)
- If markers are recreated, check if it triggers `fitBounds` or camera moves
- Marker recreation can cause visual flickering

---

### 6. Container Resize Logging

**Purpose:** Track container size changes to detect if layout shifts are causing camera jumps.

**Logs:**
```
[SCHEDULE_MAP_RESIZE]
old=<WxH>
new=<WxH>
reason=<container_resize>
mapInstance=<id>
userInteracted=<true/false>
timestamp=...
```

**Location:** Lines 1179-1209 in ScheduleMap.tsx

**What to look for:**
- Container size changes during manual drag (should not happen)
- Even small size changes (1-2px) can cause Google Maps to re-render
- Resize during interaction will cause visual jumps

---

### 7. State Restoration Logging

**Purpose:** Track per-date state restoration to detect if saved viewport restoration is causing camera moves.

**Logs:**
```
[SCHEDULE_MAP_STATE_RESTORE]
dateKey=<YYYY-MM-DD>
hasSavedState=<true/false>
mapReady=<true/false>
mapInstance=<id>
```

**Location:** Lines 1246-1252 in ScheduleMap.tsx

**What to look for:**
- State restoration during manual interaction (should not happen)
- If `date_state_restoration` camera command fires during drag, it's a feedback loop

---

## Event Listeners Instrumented

All major map events now log camera state:

1. **dragstart** - User begins dragging
2. **drag** - User is dragging (throttled)
3. **dragend** - User stops dragging
4. **zoom_changed** - Zoom level changes
5. **center_changed** - Map center changes
6. **bounds_changed** - Map bounds change
7. **idle** - Movement settles

**Location:** Lines 1107-1142 in ScheduleMap.tsx

---

## How to Use This Instrumentation

### Test Scenarios

1. **Slow pan:** Click and hold, slowly pan the map
   - Expected: Only drag/dragstart/dragend/idle logs
   - Problem: Any camera commands or state restoration

2. **Fast pan/flick:** Quickly flick the map
   - Expected: Drag events followed by idle
   - Problem: Camera commands during or after flick

3. **Mouse-wheel zoom:** Use mouse wheel to zoom
   - Expected: zoom_changed events only
   - Problem: Camera commands or center_changed during zoom

4. **Repeated zoom in/out:** Rapidly zoom in and out
   - Expected: zoom_changed events only
   - Problem: Camera commands or render spikes

5. **Pan during async geocoding:** Pan while addresses are being geocoded
   - Expected: Drag events only, geocoding completes in background
   - Problem: Camera commands when geocoding completes

6. **Pan after data settled:** Wait for all data to load, then pan
   - Expected: Clean drag events only
   - Problem: Any camera commands

7. **Pan with markers visible:** Pan with multiple markers on map
   - Expected: Drag events only
   - Problem: Marker recreation or camera commands

### Log Analysis Checklist

During a 20-second manual pan/zoom test:

- [ ] Map instance count remains 1 (check `[SCHEDULE_MAP_INSTANCE_CREATED]` count)
- [ ] No automatic camera command fires during drag (check `[SCHEDULE_MAP_CAMERA_COMMAND]`)
- [ ] No camera feedback loop (check if idle triggers camera commands)
- [ ] Marker recreation is bounded (check `[SCHEDULE_MAP_MARKERS]` - should be 0 during drag)
- [ ] Container size remains stable (check `[SCHEDULE_MAP_RESIZE]` - should be empty during drag)
- [ ] Center/zoom changes correspond only to user gesture (check `deltaInfo` in camera state logs)
- [ ] No snap-back or micro-recenter after release (check camera state after idle)

### Identifying the Root Cause

**If map instance recreation detected:**
- Check React component key props
- Check conditional rendering
- Check useEffect dependencies causing remount
- Fix: Stabilize component identity or prevent remount

**If camera commands during drag detected:**
- Check source of command in `[SCHEDULE_MAP_CAMERA_COMMAND]`
- If `marker_update_effect`, check marker identity stability
- If `date_state_restoration`, check if effect is triggering during drag
- Fix: Add guards to prevent camera commands during user interaction

**If render spikes detected:**
- Check which state updates during drag
- Check if map event listeners call setState
- Fix: Remove state updates from event listeners or use refs

**If marker recreation detected:**
- Check marker array identity
- Check if marker effect dependencies change
- Fix: Use useMemo for marker arrays or stabilize dependencies

**If container resize detected:**
- Check CSS transitions, flex/grid recalculations
- Check if parent components resize
- Fix: Stabilize container size or prevent resize during interaction

---

## Current Status

**Build:** ✅ Compiled successfully
**Tests:** ✅ 11/11 ScheduleMap tests passed
**Git Diff --check:** ✅ No whitespace errors
**Modified Files:** `src/components/schedule/ScheduleMap.tsx` only

**Changes Summary:**
- Added map instance ID tracking
- Added detailed camera state logging for all map events
- Added camera command logging for all mutations
- Added React render counting
- Added marker lifecycle logging
- Added container resize monitoring
- Added state restoration logging
- Added map instance destruction logging

---

## Next Steps

1. **Deploy instrumentation to production** (or staging)
2. **Perform physical tests** on desktop browser
3. **Collect logs** during manual pan/zoom operations
4. **Analyze logs** using the checklist above
5. **Identify the exact root cause** based on evidence
6. **Implement the fix** targeting only the proven cause
7. **Remove instrumentation** after fix is verified (or keep gated behind feature flag)

---

## Important Notes

- This instrumentation is **NOT a fix** - it's diagnostic only
- The logs will help identify the actual source of jitter
- Do NOT add additional boolean/ref guards without evidence
- Fix only the proven cause after log analysis
- The current `userInteracted` guard may be insufficient if the issue is elsewhere (e.g., map recreation, container resize, render spikes)