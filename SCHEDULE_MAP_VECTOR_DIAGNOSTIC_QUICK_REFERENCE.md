# Schedule Map Vector Diagnostic - Quick Reference

## How to Test RASTER vs VECTOR Rendering

### Prerequisites

1. **Create a Google Cloud Map ID:**
   - Go to https://console.cloud.google.com
   - Navigate to: Maps Platform → Map Management → Map IDs
   - Click "Create Map ID"
   - Name it (e.g., "replyflow-schedule-map")
   - Copy the Map ID (e.g., "abc123def456")

### Testing Instructions

#### Step 1: Enable Vector Mode

1. Open Schedule Map in Chrome
2. Open DevTools → Console
3. Enable vector mode:
   ```javascript
   window.__scheduleMapPerf.enableVectorMode('YOUR_MAP_ID_HERE')
   ```
4. Map will recreate immediately with vector rendering
5. Console logs: `[SCHEDULE_MAP] Vector mode enabled with mapId: ... Map will recreate.`

#### Step 2: Verify Mode

```javascript
window.__scheduleMapPerf.getRenderingMode()
// Returns:
{
  diagnosticVectorEnabled: true,
  configuredMapId: 'YOUR_MAP_ID',
  requestedRenderingType: 'VECTOR',
  actualRenderingType: 'VECTOR',
  mapInstance: 'map-...'
}
```

#### Step 3: Test Vector Performance

1. Open DevTools → Performance
2. Click Record
3. Perform: 2 sec idle → 5 sec drag → 2 sec idle → zoom in/out
4. Stop recording
5. Save as "vector-test.trace"
6. Note subjective feel

#### Step 4: Reload and Verify Persistence

```javascript
location.reload()
// After reload:
window.__scheduleMapPerf.getRenderingMode()
// Still returns vector configuration (persisted via localStorage)
```

#### Step 5: Disable Vector Mode

```javascript
window.__scheduleMapPerf.disableVectorMode()
// Map will recreate immediately with raster rendering
```

#### Step 6: Test RASTER Baseline

1. Map is now in RASTER mode
2. Open DevTools → Performance
3. Click Record
4. Perform: **exact same sequence** as vector test
5. Stop recording
6. Save as "raster-baseline.trace"
7. Note subjective feel

#### Step 7: Compare

Open both traces in Chrome DevTools and compare:
- FPS
- Frame duration
- Paint/raster/composite costs
- Subjective smoothness

### Console API Reference

```javascript
// Check current rendering mode (returns structured object)
window.__scheduleMapPerf.getRenderingMode()

// Enable vector mode with your map ID (map recreates immediately)
window.__scheduleMapPerf.enableVectorMode('YOUR_MAP_ID_HERE')

// Disable vector mode (map recreates immediately)
window.__scheduleMapPerf.disableVectorMode()

// Reset performance counters
window.__scheduleMapPerf.resetCounters()

// Get gesture render count
window.__scheduleMapPerf.getGestureRenderCount()

// Get operations during gesture
window.__scheduleMapPerf.getOpsDuringGesture()
```

### Expected Console Logs

**Raster Mode (Default):**
```
[SCHEDULE_MAP_VECTOR_MODE] RASTER (default)
[SCHEDULE_MAP_RENDERING_MODE] {
  diagnosticVectorEnabled: false,
  configuredMapId: null,
  requestedRenderingType: 'RASTER',
  actualRenderingType: 'RASTER',
  mapInstance: 'map-1-...',
  timestamp: 1234567890
}
```

**Vector Mode (Diagnostic):**
```
[SCHEDULE_MAP] Vector mode enabled with mapId: YOUR_MAP_ID. Map will recreate.
[SCHEDULE_MAP_VECTOR_MODE] VECTOR (diagnostic)
[SCHEDULE_MAP_RENDERING_MODE] {
  diagnosticVectorEnabled: true,
  configuredMapId: 'YOUR_MAP_ID',
  requestedRenderingType: 'VECTOR',
  actualRenderingType: 'VECTOR',
  mapInstance: 'map-1-...',
  timestamp: 1234567890
}
```

### Persistence

**Vector mode persists across:**
- Page reloads
- Browser sessions (until disabled)
- Tab closes/reopens (same browser)

**To clear all diagnostics:**
```javascript
localStorage.removeItem('replyflow_schedule_vector_diagnostic_enabled')
localStorage.removeItem('replyflow_schedule_vector_diagnostic_map_id')
location.reload()
```

### Success Criteria

Vector is only a winner if:
- Map follows pointer immediately
- No loose/rubbery movement
- Smooth diagonal pan
- Smooth zoom
- No obvious tile catch-up
- **Materially closer to Zillow/Google Maps feel**

If difference is negligible → Do NOT migrate.

### Important

- This is diagnostic only
- Production still uses RASTER by default
- Vector mode requires manual console activation
- Vector mode requires valid Google Cloud Map ID
- Diagnostics persist via localStorage
- Do NOT commit vector migration unless it clearly wins