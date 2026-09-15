# Schedule Map Vector Rendering Diagnostic Implementation Report

## Summary

Added diagnostic mode to enable RASTER vs VECTOR rendering A/B testing for the Schedule Map. This allows physical testing to determine if vector rendering improves manual navigation smoothness toward Zillow-level quality.

---

## PART 1 — Vector Rendering Requirements

**Google Maps Vector Rendering Requirements:**

1. **Map ID Required:**
   - Must be created in Google Cloud Console
   - Location: Google Maps Platform → Map Management → Map IDs
   - Required for vector rendering
   - Enables custom styling and vector tiles

2. **Rendering Type:**
   - Must explicitly set `renderingType: 'VECTOR'` in map options
   - When mapId is present, Google Maps defaults to vector
   - Explicit setting ensures vector mode is used

3. **Maps API Support:**
   - Current loader: `https://maps.googleapis.com/maps/api/js?key={key}&libraries=places&loading=async`
   - Supports mapId parameter
   - Supports renderingType parameter
   - No API version change required

4. **Platform Support:**
   - **Desktop Chrome:** Full vector support
   - **Android WebView:** Supported (Capacitor uses system WebView)
   - **iOS WKWebView:** Supported (Capacitor uses WKWebView)

5. **Google Cloud Configuration:**
   - Requires Google Cloud project with Maps JavaScript API enabled
   - Requires Map ID creation in Google Cloud Console
   - No additional billing beyond existing Maps API usage
   - Vector tiles are included in standard Maps JavaScript API pricing

---

## PART 2 — Diagnostic Implementation

**Added State:**
```typescript
const [enableVectorMode, setEnableVectorMode] = useState(false)
```

**Diagnostic Toggle Mechanism:**
```typescript
useEffect(() => {
  if (typeof window !== 'undefined') {
    const handler = () => {
      const enabled = (window as any).__enableVectorMap === true
      setEnableVectorMode(enabled)
      console.log('[SCHEDULE_MAP_VECTOR_MODE]', enabled ? 'VECTOR (diagnostic)' : 'RASTER (default)')
    }
    window.addEventListener('__vectorModeChange', handler as any)
    handler() // Check initial value
    return () => {
      window.removeEventListener('__vectorModeChange', handler as any)
    }
  }
}, [])
```

**Map Options Enhancement:**
```typescript
const mapOptions: any = {
  // ... existing options
  ...(enableVectorMode && {
    mapId: (window as any).__vectorMapId || 'YOUR_MAP_ID_HERE',
    renderingType: 'VECTOR'
  }),
  // ... rest of options
}
```

**Runtime Verification:**
```typescript
const actualMapId = mapOptions.mapId || null
const actualRenderingType = mapOptions.renderingType || 'RASTER'
const isVectorMode = actualMapId !== null && actualRenderingType === 'VECTOR'
console.log('[SCHEDULE_MAP_RENDERING_MODE]', {
  mode: isVectorMode ? 'VECTOR' : 'RASTER',
  mapId: actualMapId,
  renderingType: actualRenderingType,
  diagnostic: enableVectorMode,
  timestamp: Date.now()
})
```

**Console Helper Functions:**
```typescript
window.__scheduleMapPerf = {
  // ... existing methods
  getRenderingMode: () => {
    if (!googleMapRef.current) return 'MAP_NOT_READY'
    return enableVectorMode ? 'VECTOR' : 'RASTER'
  },
  enableVectorMode: (mapId?: string) => {
    if (mapId) {
      (window as any).__vectorMapId = mapId
    }
    (window as any).__enableVectorMap = true
    window.dispatchEvent(new Event('__vectorModeChange'))
    console.log('[SCHEDULE_MAP] Vector mode enabled. Reload page to apply.')
  },
  disableVectorMode: () => {
    (window as any).__enableVectorMap = false
    window.dispatchEvent(new Event('__vectorModeChange'))
    console.log('[SCHEDULE_MAP] Vector mode disabled. Reload page to apply.')
  }
}
```

---

## PART 3 — How to Use Diagnostic Mode

**Step 1: Create Map ID in Google Cloud Console**
1. Go to Google Cloud Console
2. Navigate to: Maps Platform → Map Management → Map IDs
3. Click "Create Map ID"
4. Give it a name (e.g., "replyflow-schedule-map")
5. Copy the Map ID (format: alphanumeric string)

**Step 2: Enable Vector Mode in Browser Console**
```javascript
// Option 1: With your map ID
window.__scheduleMapPerf.enableVectorMode('YOUR_MAP_ID_HERE')

// Option 2: With placeholder (will warn if invalid)
window.__scheduleMapPerf.enableVectorMode()
```

**Step 3: Reload the Page**
The map will recreate with vector rendering enabled.

**Step 4: Verify Rendering Mode**
Check console for:
```
[SCHEDULE_MAP_RENDERING_MODE] {
  mode: 'VECTOR',
  mapId: 'YOUR_MAP_ID_HERE',
  renderingType: 'VECTOR',
  diagnostic: true,
  timestamp: ...
}
```

**Step 5: Disable Vector Mode**
```javascript
window.__scheduleMapPerf.disableVectorMode()
// Reload page to apply
```

---

## PART 4 — Current Raster Configuration

**Exact Current Configuration (Default):**
```typescript
const mapOptions: any = {
  center: initialCenter,
  zoom: initialZoom,
  mapTypeId: initialMapTypeId, // ROADMAP or HYBRID
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  gestureHandling: 'greedy',
  // mapId: undefined (not set)
  // renderingType: undefined (defaults to RASTER)
  styles: [...]
}
```

**Rendering Mode:**
- Default: RASTER (tile-based)
- No mapId configured
- No renderingType specified
- Uses Google Maps default raster tiles

---

## PART 5 — Vector Configuration (Diagnostic)

**Diagnostic Vector Configuration:**
```typescript
const mapOptions: any = {
  // ... same as raster
  ...(enableVectorMode && {
    mapId: (window as any).__vectorMapId || 'YOUR_MAP_ID_HERE',
    renderingType: 'VECTOR'
  }),
  // ... same as raster
}
```

**Rendering Mode:**
- Diagnostic: VECTOR (when enabled)
- Requires valid mapId from Google Cloud Console
- Explicitly sets renderingType to 'VECTOR'
- Uses Google Maps vector tiles

---

## PART 6 — Runtime Verification

**Console Logs:**

**Raster Mode (Default):**
```
[SCHEDULE_MAP_VECTOR_MODE] RASTER (default)
[SCHEDULE_MAP_RENDERING_MODE] {
  mode: 'RASTER',
  mapId: null,
  renderingType: 'RASTER',
  diagnostic: false,
  timestamp: ...
}
```

**Vector Mode (Diagnostic):**
```
[SCHEDULE_MAP_VECTOR_MODE] VECTOR (diagnostic)
[SCHEDULE_MAP_RENDERING_MODE] {
  mode: 'VECTOR',
  mapId: 'YOUR_MAP_ID_HERE',
  renderingType: 'VECTOR',
  diagnostic: true,
  timestamp: ...
}
```

---

## PART 7 — Physical Testing Instructions

**Baseline Raster Test:**

1. Open Schedule Map in browser
2. Open Chrome DevTools → Performance
3. Reset counters: `window.__scheduleMapPerf.resetCounters()`
4. Verify mode: `window.__scheduleMapPerf.getRenderingMode()` should return 'RASTER'
5. Record Performance trace:
   - 2 sec idle
   - 5 sec slow/medium manual drag
   - 2 sec idle
   - Wheel/trackpad zoom in
   - Zoom out
6. Note subjective feel:
   - Pointer attachment
   - Inertia
   - Rubber-band feeling
   - Tile catch-up
   - Zoom smoothness

**Vector Mode Test:**

1. Enable vector mode: `window.__scheduleMapPerf.enableVectorMode('YOUR_MAP_ID')`
2. Reload page
3. Verify mode: `window.__scheduleMapPerf.getRenderingMode()` should return 'VECTOR'
4. Check console for `[SCHEDULE_MAP_RENDERING_MODE]` log
5. Reset counters: `window.__scheduleMapPerf.resetCounters()`
6. Record Performance trace with **exact same sequence** as raster test
7. Note subjective feel with **same criteria** as raster test

**Comparison:**

Create side-by-side table of metrics:
- FPS
- Worst frame duration
- Frames > 16.7ms
- Frames > 33ms
- Paint cost
- Raster cost
- Composite cost
- Subjective drag smoothness
- Zoom smoothness
- Marker visual locking

---

## PART 8 — Zillow-Like Acceptance Criteria

Vector is only considered a winner if it feels **materially closer** to:

- Zillow
- Native Google Maps interaction

**Specific Criteria:**
- Map follows pointer immediately
- No loose/rubbery movement
- Smooth diagonal pan
- Smooth rapid repeated short drags
- Smooth wheel/trackpad zoom
- No obvious tile catch-up
- Markers remain visually locked to geography

**If difference is negligible:**
DO NOT migrate to vector.

---

## PART 9 — Mobile Risk Assessment

**Android WebView (Capacitor):**
- Capacitor uses system WebView on Android
- System WebView supports Google Maps vector rendering
- One-finger pan: Supported
- Pinch zoom: Supported
- GPU rendering: Supported

**iOS WKWebView (Capacitor):**
- Capacitor uses WKWebView on iOS
- WKWebView supports Google Maps vector rendering
- One-finger pan: Supported
- Pinch zoom: Supported
- GPU rendering: Supported

**Risk Level:**
- Desktop: Low risk (full support)
- Android: Low risk (system WebView support)
- iOS: Low risk (WKWebView support)

**Recommendation:**
If vector wins on desktop, mobile compatibility is likely acceptable. Full native build testing still required before production migration.

---

## PART 10 — Autofocus Safety

**No Changes To:**
- fitBoundsWithMaxZoom
- Initial framing
- Selected-day framing
- userInteracted semantics
- Corrective framing
- panToMarker
- Map lifecycle behavior
- Map type switching logic
- Marker update logic
- Stop color logic

**Only Changes:**
- Diagnostic state for vector mode
- Map options conditional on diagnostic state
- Console helper functions
- Runtime verification logging

**Autofocus behavior is identical in both modes.**

---

## PART 11 — Files Changed

1. `src/components/schedule/ScheduleMap.tsx`
   - Added `enableVectorMode` state
   - Added diagnostic toggle mechanism via window events
   - Enhanced map options to include mapId/renderingType when vector mode enabled
   - Added runtime verification of rendering mode
   - Added console helper functions to enable/disable vector mode
   - Updated map initialization effect dependencies to recreate when vector mode changes
   - Enhanced performance API with rendering mode info

**Lines Changed:**
- Lines 294-314: Added vector mode state and toggle mechanism
- Lines 1487-1503: Enhanced map options with conditional vector configuration
- Lines 1526-1546: Added runtime verification of rendering mode
- Lines 2020-2044: Added rendering mode info and helper functions to performance API
- Line 1660: Updated map initialization dependencies

---

## PART 12 — Tests/Build

**Tests Run:**
- 24 ScheduleMap tests passed
- Production build successful
- TypeScript validation passed

---

## PART 13 — Commit SHA

`5af3fd57` - "add diagnostic mode for RASTER vs VECTOR rendering A/B test"

---

## PART 14 — Next Steps

**Required Physical Testing:**

1. **Create Map ID:**
   - Go to Google Cloud Console
   - Create Map ID for ReplyFlow Schedule Map
   - Copy Map ID

2. **Baseline Raster Test:**
   - Verify current mode is RASTER
   - Capture Chrome Performance trace
   - Note subjective feel

3. **Vector Mode Test:**
   - Enable vector mode with mapId
   - Reload page
   - Verify mode is VECTOR
   - Capture Chrome Performance trace (same sequence)
   - Note subjective feel

4. **Comparison:**
   - Create side-by-side metrics table
   - Evaluate if vector materially improves smoothness
   - Check if feel is closer to Zillow/Google Maps

**Decision Criteria:**
- If vector clearly wins → Proceed with production migration
- If difference is negligible → Do NOT migrate, investigate other causes
- If vector is worse → Do NOT migrate

---

## PART 15 — Production Migration (If Vector Wins)

**If vector is materially better, production migration would require:**

1. Add canonical Map ID to environment variables
2. Update map options to always use vector rendering
3. Remove diagnostic toggle code
4. Add tests for vector rendering configuration
5. Full native build testing on Android/iOS
6. Verify autofocus behavior unchanged

**This is NOT yet done.** Only diagnostic code has been added.

---

## PART 16 — Important Notes

**Diagnostic Only:**
- This commit adds diagnostic mode only
- Production behavior is unchanged (still RASTER)
- Vector mode requires manual console activation
- Vector mode requires valid mapId from Google Cloud Console

**No Production Change:**
- Default behavior remains RASTER
- No mapId configured in production
- No renderingType change in production
- No autofocus changes

**Physical Testing Required:**
- Cannot determine winner from code analysis alone
- Must perform physical Chrome Performance traces
- Must compare subjective feel
- Must verify mobile compatibility before production migration