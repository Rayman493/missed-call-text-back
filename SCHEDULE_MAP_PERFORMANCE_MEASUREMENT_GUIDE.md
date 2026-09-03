# Schedule Map Gesture Performance Measurement Guide

This guide explains how to use the performance instrumentation added to ScheduleMap to identify the root cause of manual gesture smoothness issues.

## Instrumentation Added

The following instrumentation has been added to `ScheduleMap.tsx`:

### 1. Render Counters
- `renderCountRef.current` - Total component renders
- `gestureRenderCountRef.current` - Renders during active gestures (drag/zoom)

### 2. Operation Counters
- `opCountersRef.current.mapCreate` - Count of google.maps.Map() calls
- `opCountersRef.current.markerCreate` - Count of marker creation
- `opCountersRef.current.markerSetMap` - Count of marker.setMap() calls
- `opCountersRef.current.markerSetIcon` - Count of marker.setIcon() calls
- `opCountersRef.current.markerSetPosition` - Count of marker.setPosition() calls
- `opCountersRef.current.mapSetCenter` - Count of map.setCenter() calls
- `opCountersRef.current.mapPanTo` - Count of map.panTo() calls
- `opCountersRef.current.mapFitBounds` - Count of map.fitBounds() calls
- `opCountersRef.current.mapSetZoom` - Count of map.setZoom() calls
- `opCountersRef.current.mapSetOptions` - Count of map.setOptions() calls
- `opCountersRef.current.markerCleanup` - Count of marker cleanup operations

### 3. Browser Console API
All counters are exposed via `window.__scheduleMapPerf` for inspection in the browser console.

## How to Measure Performance

### Step 1: Open Browser Console
1. Open the Schedule Map page in Chrome
2. Open DevTools (F12)
3. Go to Console tab

### Step 2: Reset Counters Before Test
```javascript
window.__scheduleMapPerf.resetCounters()
```

### Step 3: Perform Manual Gesture
1. Start a 5-second manual drag
2. Perform the drag
3. Release

### Step 4: Capture Counter Values
```javascript
// Check render counts
console.log('Total renders:', window.__scheduleMapPerf.getRenderCount())
console.log('Gesture renders:', window.__scheduleMapPerf.getGestureRenderCount())

// Check operation counts
console.log('Operation counts:', window.__scheduleMapPerf.getOpCounters())

// Check other metrics
console.log('Active gesture:', window.__scheduleMapPerf.getActiveGesture())
console.log('Map instance:', window.__scheduleMapPerf.getMapInstance())
console.log('Marker count:', window.__scheduleMapPerf.getMarkerCount())
console.log('Device pixel ratio:', window.__scheduleMapPerf.getDevicePixelRatio())
console.log('Canvas scale:', window.__scheduleMapPerf.getCanvasScale())
```

### Step 5: Record Results
Document the values in a text editor for analysis.

## Expected Values During Manual Drag

**If gesture smoothness is good:**
- `gestureRenderCount`: 0 (no React renders during drag)
- `markerSetIcon`: 0 (guarded by activeGestureRef)
- `markerSetMap`: 0 (markers stay attached)
- `markerCreate`: 0 (guarded by activeGestureRef)
- `mapSetCenter`: 0 (no programmatic moves)
- `mapPanTo`: 0 (no programmatic moves)
- `mapFitBounds`: 0 (guarded by activeGestureRef)

**If gesture smoothness is bad:**
- Any non-zero values above indicate ReplyFlow code is fighting the gesture

## Chrome Performance Profiling

To capture detailed performance data:

### Step 1: Open Performance Tab
1. Open DevTools (F12)
2. Go to Performance tab

### Step 2: Start Recording
1. Click "Record" button
2. Wait 2 seconds (idle baseline)
3. Perform 5-second manual pan
4. Wait 2 seconds (idle)
5. Zoom in
6. Zoom out
7. Stop recording

### Step 3: Analyze Results
Look for:
- **Long tasks (>50ms)** - Indicate blocking main-thread work
- **Scripting** - JavaScript execution time
- **Rendering** - Layout/paint time
- **Painting** - Composite layer work
- **System** - Browser overhead

Focus on the 5-second drag window.

### Step 4: Record Top Costs
Document the top 10 costs by duration during the drag window.

## React Profiler

If React DevTools is available:

### Step 1: Open Profiler Tab
1. Open DevTools (F12)
2. Go to Profiler tab

### Step 2: Start Recording
1. Click "Record" button
2. Perform manual drag
3. Stop recording

### Step 3: Analyze Commits
Look for:
- Whether ScheduleMap commits during drag
- Which components commit
- Why they rendered
- Total commit time
- Largest commit

## Canvas Icon Scaling Analysis

The current marker icon implementation:
- **Canvas scale**: 2 (hardcoded in createNumberedMarkerIcon)
- **Canvas dimensions**: size * scale (e.g., 72x72 for 36px marker)
- **Display size**: size (36px or 44px)
- **Device pixel ratio**: Exposed via `window.__scheduleMapPerf.getDevicePixelRatio()`

Check if:
- Canvas scale matches device pixel ratio
- If scale > devicePixelRatio, canvas is being downscaled (can cause blur)
- If scale < devicePixelRatio, canvas is being upscaled (can cause pixelation)

## Map Rendering Mode

To check Google Maps rendering mode:

```javascript
// In browser console on map page
const map = window.__scheduleMapPerf.getMapInstance()
// Check map configuration via Google Maps API if needed
```

Current configuration (from code):
- Map type: Roadmap or Hybrid (satellite)
- No mapId configured
- No explicit renderingType set
- gestureHandling: default ('cooperative')

## AdvancedMarker A/B Test

If React/main-thread profile shows no ReplyFlow churn, create an A/B test:

### Test Setup
Create a temporary test component that renders:
1. Legacy google.maps.Marker with current canvas PNG icon
2. google.maps.marker.AdvancedMarkerElement with simple DOM content

### Test Procedure
1. Place both markers at nearby fixed coordinates
2. Test: slow pan, fast pan, diagonal pan, zoom in, zoom out
3. Observe: visual locking, lag/swim, perceived smoothness

### Evaluation
If AdvancedMarker is materially smoother, note:
- Marker library load requirement
- mapId requirement
- Google Cloud configuration
- Billing implications
- Platform compatibility

## Canvas Icon A/B Test

To isolate canvas icon performance:

Compare:
A. Legacy Marker + canvas PNG (current)
B. Legacy Marker + simple built-in icon
C. AdvancedMarker + simple DOM marker

This will identify if the issue is:
- Marker API (legacy vs Advanced)
- Canvas icon rendering
- Map rendering generally

## Reporting Results

Create a report with:

1. **React renders during 5-second drag**
   - Total renders
   - Gesture renders
   - Exact state/prop causes if > 0

2. **Exact map operation counts**
   - Map creates
   - Marker creates
   - setMap calls
   - setIcon calls
   - setCenter/panTo calls
   - fitBounds calls

3. **Chrome Performance top costs**
   - Top 10 costs by duration
   - Long tasks (>50ms)
   - React commit time

4. **React Profiler result**
   - Commits during drag (yes/no)
   - Which components
   - Why they rendered

5. **DevicePixelRatio/canvas scaling**
   - devicePixelRatio value
   - Canvas scale value
   - Whether scale matches devicePixelRatio

6. **Map rendering mode**
   - Raster or vector
   - mapId presence
   - gestureHandling mode

7. **Legacy Marker A/B result**
   - Visual comparison
   - Perceived smoothness difference

8. **Canvas-icon A/B result**
   - Performance difference
   - Visual quality difference

9. **AdvancedMarker viability**
   - Migration requirements
   - Platform compatibility
   - Configuration needs

10. **Exact proven root cause**
    - Which category (A-G) is the issue
    - Specific evidence

## Success Criteria

After measurement, we should know exactly whether the bad manual feel comes from:
- ReplyFlow React work
- Marker rendering
- Canvas icon rendering
- Google Maps configuration
- Browser/compositor behavior

Do not call it fixed until the physical drag actually feels better.