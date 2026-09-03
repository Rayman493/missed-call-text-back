# Schedule Map Manual Smoothness Diagnostic Script

## Instructions

Run this script in the browser console after loading a day with multiple visible stops.

## Part 1: Check Instrumentation Availability

```javascript
// Check if instrumentation is available
if (!window.__scheduleMapPerf) {
  console.error('Performance instrumentation not available. Open Schedule Map first.');
} else {
  console.log('✓ Performance instrumentation available');
}
```

## Part 2: Capture Baseline State

```javascript
// Reset counters
window.__scheduleMapPerf.resetCounters();

// Capture baseline
const baseline = {
  renderCount: window.__scheduleMapPerf.getRenderCount(),
  gestureRenderCount: window.__scheduleMapPerf.getGestureRenderCount(),
  opCounters: window.__scheduleMapPerf.getOpCounters(),
  activeGesture: window.__scheduleMapPerf.getActiveGesture(),
  mapInstance: window.__scheduleMapPerf.getMapInstance(),
  markerCount: window.__scheduleMapPerf.getMarkerCount(),
  devicePixelRatio: window.__scheduleMapPerf.getDevicePixelRatio(),
  canvasScale: window.__scheduleMapPerf.getCanvasScale(),
  timestamp: Date.now()
};

console.log('BASELINE STATE:', baseline);
```

## Part 3: Measure 5-Second Drag

```javascript
// Reset before drag
window.__scheduleMapPerf.resetCounters();

console.log('START: Drag continuously for ~5 seconds...');

// After 5 seconds of dragging, wait 2 seconds, then capture:
setTimeout(() => {
  const afterDrag = {
    renderCount: window.__scheduleMapPerf.getRenderCount(),
    gestureRenderCount: window.__scheduleMapPerf.getGestureRenderCount(),
    opCounters: window.__scheduleMapPerf.getOpCounters(),
    activeGesture: window.__scheduleMapPerf.getActiveGesture(),
    markerCount: window.__scheduleMapPerf.getMarkerCount(),
    timestamp: Date.now()
  };

  console.log('AFTER DRAG STATE:', afterDrag);
  console.log('DELTA:', {
    totalRenders: afterDrag.renderCount - baseline.renderCount,
    gestureRenders: afterDrag.gestureRenderCount,
    mapCreate: afterDrag.opCounters.mapCreate,
    markerCreate: afterDrag.opCounters.markerCreate,
    markerSetMap: afterDrag.opCounters.markerSetMap,
    markerSetIcon: afterDrag.opCounters.markerSetIcon,
    markerCleanup: afterDrag.opCounters.markerCleanup,
    markerSetPosition: afterDrag.opCounters.markerSetPosition,
    mapSetCenter: afterDrag.opCounters.mapSetCenter,
    mapPanTo: afterDrag.opCounters.mapPanTo,
    mapFitBounds: afterDrag.opCounters.mapFitBounds,
    mapSetZoom: afterDrag.opCounters.mapSetZoom,
    mapSetOptions: afterDrag.opCounters.mapSetOptions
  });
}, 7000); // 5s drag + 2s wait
```

## Part 4: Check Canvas Scaling Issue

```javascript
// Check canvas scaling mismatch
const dpr = window.devicePixelRatio;
const canvasScale = window.__scheduleMapPerf.getCanvasScale();
const scalingMismatch = dpr !== canvasScale;

console.log('CANVAS SCALING ANALYSIS:', {
  devicePixelRatio: dpr,
  canvasScale: canvasScale,
  mismatch: scalingMismatch,
  issue: scalingMismatch ? `Canvas generated at ${canvasScale}x but device is ${dpr}x - causes double-scaling` : 'Scaling matches device'
});

// Calculate actual canvas sizes
const markerSizes = [36, 44]; // unselected, selected
markerSizes.forEach(size => {
  const actualCanvasSize = size * canvasScale;
  const scaledSize = size; // what Google Maps is told
  console.log(`Marker ${size}px: canvas=${actualCanvasSize}px, scaledSize=${scaledSize}px, downscaled by=${actualCanvasSize/scaledSize}x`);
});
```

## Part 5: Check Map Rendering Mode

```javascript
// Get map instance
const map = window.__scheduleMapPerf.getMapInstance();
if (!map) {
  console.error('Map instance not available');
} else {
  console.log('MAP RENDERING MODE:', {
    mapId: map.mapId,
    renderingType: map.renderingType,
    tilt: map.tilt,
    heading: map.heading,
    isFractionalZoomEnabled: map.isFractionalZoomEnabled,
    gestureHandling: map.gestureHandling
  });
}
```

## Part 6: React DevTools Profiler

1. Open React DevTools Profiler tab
2. Click "Start profiling"
3. Perform 5-second drag
4. Click "Stop profiling"
5. Record:
   - Number of commits during drag
   - Which components committed
   - Render reasons
   - Total commit time
   - Largest commit

## Part 7: Chrome Performance Profile

1. Open Chrome DevTools Performance tab
2. Click "Start profiling"
3. Record 2 seconds idle
4. Perform 5-second drag
5. Record 2 seconds idle
6. Perform zoom in/out
7. Click "Stop profiling"
8. Analyze the drag window:
   - Top 10 main-thread costs by duration
   - Long tasks > 50ms
   - Scripting time
   - Rendering time
   - Painting time
   - Composite layers
   - GC pauses
   - React commits
   - Google Maps JS work
   - Canvas/image work

## Part 8: AdvancedMarker Availability Check

```javascript
// Check if AdvancedMarkerElement is available
const google = window.google;
if (!google) {
  console.error('Google Maps not loaded');
} else {
  console.log('ADVANCED MARKER AVAILABILITY:', {
    maps: !!google.maps,
    marker: !!google.maps.marker,
    AdvancedMarkerElement: !!google.maps.marker.AdvancedMarkerElement,
    hasAdvancedMarker: !!google.maps.marker?.AdvancedMarkerElement
  });
}
```

## Expected Results

### If React is the bottleneck:
- gestureRenderCount > 0
- React Profiler shows commits during drag
- Chrome profile shows React-related long tasks

### If canvas scaling is the issue:
- devicePixelRatio !== canvasScale (e.g., 3x vs 2x)
- Canvas is generated at 2x but device is 3x (or vice versa)
- Chrome profile shows image decode/resample costs

### If map rendering mode is the issue:
- renderingType shows outdated mode
- Chrome profile shows Google Maps rendering costs

### If markers are the issue:
- markerSetIcon > 0 during gesture
- markerCreate > 0 during gesture
- Chrome profile shows marker-related costs

### If everything is clean:
- gestureRenderCount = 0
- All operation counters = 0 (except initial creation)
- No React commits during drag
- Canvas scaling mismatch exists
- AdvancedMarker is available