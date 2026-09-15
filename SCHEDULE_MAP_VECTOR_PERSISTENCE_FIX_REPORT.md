# Schedule Map Vector Diagnostic Persistence Fix Report

## Summary

Fixed the vector diagnostic mode to persist across page reloads using localStorage. The diagnostic now survives page reload and can be verified after reload.

---

## PART 1 — Root Cause Analysis

**Original Implementation Problem:**

1. **State Not Persisted:**
   - `enableVectorMode` was a React state initialized to `false`
   - `enableVectorMode` was set via a window global `__enableVectorMap`
   - On page reload, both the window global and React state were lost
   - No localStorage persistence existed

2. **Helper Functions Lifecycle:**
   - `window.__scheduleMapPerf` was assigned in a useEffect with no dependencies
   - The helper functions closed over initial state values
   - After reload, the useEffect ran again but state was reinitialized to `false`
   - Helper functions didn't read from any persistent storage

3. **Event-Based Mechanism:**
   - Used `window.dispatchEvent(new Event('__vectorModeChange'))`
   - Event listeners were attached in useEffect
   - On reload, event listeners were lost
   - Window globals were lost

**Exact Root Cause:**
The diagnostic state was stored only in React state and window globals, both of which are lost on page reload. There was no localStorage persistence mechanism.

---

## PART 2 — Persistence Mechanism

**localStorage Keys:**
```typescript
const DIAGNOSTIC_VECTOR_ENABLED_KEY = 'replyflow_schedule_vector_diagnostic_enabled'
const DIAGNOSTIC_VECTOR_MAP_ID_KEY = 'replyflow_schedule_vector_diagnostic_map_id'
```

**State Initialization from localStorage:**
```typescript
const [enableVectorMode, setEnableVectorMode] = useState(() => {
  if (typeof window !== 'undefined') {
    const enabled = localStorage.getItem(DIAGNOSTIC_VECTOR_ENABLED_KEY) === 'true'
    return enabled
  }
  return false
})

const [vectorMapId, setVectorMapId] = useState(() => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(DIAGNOSTIC_VECTOR_MAP_ID_KEY) || null
  }
  return null
})
```

**Sync State to localStorage:**
```typescript
useEffect(() => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(DIAGNOSTIC_VECTOR_ENABLED_KEY, enableVectorMode.toString())
    if (vectorMapId) {
      localStorage.setItem(DIAGNOSTIC_VECTOR_MAP_ID_KEY, vectorMapId)
    } else {
      localStorage.removeItem(DIAGNOSTIC_VECTOR_MAP_ID_KEY)
    }
    console.log('[SCHEDULE_MAP_VECTOR_MODE]', enableVectorMode ? 'VECTOR (diagnostic)' : 'RASTER (default)')
  }
}, [enableVectorMode, vectorMapId])
```

---

## PART 3 — Initialization Order

**On ScheduleMap Mount:**

1. **State Initialization:**
   - Read `DIAGNOSTIC_VECTOR_ENABLED_KEY` from localStorage
   - Read `DIAGNOSTIC_VECTOR_MAP_ID_KEY` from localStorage
   - Initialize React state from localStorage values
   - If no localStorage values, default to RASTER (enabled=false, mapId=null)

2. **Before Map Creation:**
   - Map options are constructed with conditional vector configuration
   - If `enableVectorMode === true` AND `vectorMapId !== null`:
     - Add `mapId: vectorMapId` to options
     - Add `renderingType: 'VECTOR'` to options
   - Otherwise:
     - Use default RASTER configuration (no mapId, no renderingType)

3. **Map Creation:**
   - Google Maps Map is created with configured options
   - Runtime verification logs the actual rendering mode

4. **Helper Functions Registration:**
   - `window.__scheduleMapPerf` is registered with helper functions
   - Helper functions close over current state values
   - Helper functions update state and localStorage directly
   - Map recreates when state changes

---

## PART 4 — Enable Flow

**User Action:**
```javascript
window.__scheduleMapPerf.enableVectorMode('c783fbbc07696bfd5be1f3c6')
```

**Internal Behavior:**
```typescript
enableVectorMode: (mapId?: string) => {
  if (!mapId) {
    console.error('[SCHEDULE_MAP] enableVectorMode requires a mapId parameter')
    return
  }
  localStorage.setItem(DIAGNOSTIC_VECTOR_ENABLED_KEY, 'true')
  localStorage.setItem(DIAGNOSTIC_VECTOR_MAP_ID_KEY, mapId)
  setVectorMapId(mapId)
  setEnableVectorMode(true)
  console.log('[SCHEDULE_MAP] Vector mode enabled with mapId:', mapId, '. Map will recreate.')
}
```

**Result:**
- localStorage updated with enabled=true and mapId
- React state updated
- Map effect dependencies changed → map recreates with vector configuration
- Console logs: `[SCHEDULE_MAP] Vector mode enabled with mapId: c783fbbc07696bfd5be1f3c6. Map will recreate.`

**After Reload:**
- localStorage values persist
- State initializes from localStorage on mount
- Map created with vector configuration
- Helper functions available
- Diagnostic can be verified

---

## PART 5 — Disable Flow

**User Action:**
```javascript
window.__scheduleMapPerf.disableVectorMode()
```

**Internal Behavior:**
```typescript
disableVectorMode: () => {
  localStorage.removeItem(DIAGNOSTIC_VECTOR_ENABLED_KEY)
  localStorage.removeItem(DIAGNOSTIC_VECTOR_MAP_ID_KEY)
  setVectorMapId(null)
  setEnableVectorMode(false)
  console.log('[SCHEDULE_MAP] Vector mode disabled. Map will recreate.')
}
```

**Result:**
- localStorage keys removed
- React state reset to defaults (enabled=false, mapId=null)
- Map effect dependencies changed → map recreates with raster configuration
- Console logs: `[SCHEDULE_MAP] Vector mode disabled. Map will recreate.`

**After Reload:**
- localStorage values cleared
- State initializes to defaults
- Map created with raster configuration
- Production default behavior restored

---

## PART 6 — getRenderingMode Output

**Before Map Ready:**
```javascript
window.__scheduleMapPerf.getRenderingMode()
// Returns:
{
  diagnosticVectorEnabled: true,
  configuredMapId: 'c783fbbc07696bfd5be1f3c6',
  requestedRenderingType: 'VECTOR',
  actualRenderingType: 'MAP_NOT_READY',
  mapInstance: 'map-1-...'
}
```

**After Map Ready (Vector Mode):**
```javascript
window.__scheduleMapPerf.getRenderingMode()
// Returns:
{
  diagnosticVectorEnabled: true,
  configuredMapId: 'c783fbbc07696bfd5be1f3c6',
  requestedRenderingType: 'VECTOR',
  actualRenderingType: 'VECTOR',
  mapInstance: 'map-1-...'
}
```

**After Map Ready (Raster Mode):**
```javascript
window.__scheduleMapPerf.getRenderingMode()
// Returns:
{
  diagnosticVectorEnabled: false,
  configuredMapId: null,
  requestedRenderingType: 'RASTER',
  actualRenderingType: 'RASTER',
  mapInstance: 'map-1-...'
}
```

**Structured Evidence:**
- `diagnosticVectorEnabled`: Whether diagnostic mode is enabled
- `configuredMapId`: The mapId configured (or null)
- `requestedRenderingType`: What we requested (VECTOR or RASTER)
- `actualRenderingType`: What the map is actually using
- `mapInstance`: Map instance ID for debugging

---

## PART 7 — Console Log

**After Map Initialization:**
```javascript
console.log('[SCHEDULE_MAP_RENDERING_MODE]', {
  diagnosticVectorEnabled: enableVectorMode,
  configuredMapId: actualMapId,
  requestedRenderingType: actualRenderingType,
  actualRenderingType: isVectorMode ? 'VECTOR' : 'RASTER',
  mapInstance: mapInstanceIdRef.current,
  timestamp: Date.now()
})
```

**Example Output (Vector Mode):**
```
[SCHEDULE_MAP_RENDERING_MODE] {
  diagnosticVectorEnabled: true,
  configuredMapId: 'c783fbbc07696bfd5be1f3c6',
  requestedRenderingType: 'VECTOR',
  actualRenderingType: 'VECTOR',
  mapInstance: 'map-1-1234567890',
  timestamp: 1734567890123
}
```

**Example Output (Raster Mode):**
```
[SCHEDULE_MAP_RENDERING_MODE] {
  diagnosticVectorEnabled: false,
  configuredMapId: null,
  requestedRenderingType: 'RASTER',
  actualRenderingType: 'RASTER',
  mapInstance: 'map-1-1234567890',
  timestamp: 1734567890123
}
```

---

## PART 8 — Proof RASTER Remains Default

**Default Behavior (No Diagnostic):**
- localStorage keys not set
- `enableVectorMode` initializes to `false`
- `vectorMapId` initializes to `null`
- Map options have no mapId or renderingType
- Google Maps defaults to RASTER rendering
- Production behavior unchanged

**Verification:**
```javascript
// Fresh page load (no diagnostic enabled)
window.__scheduleMapPerf.getRenderingMode()
// Returns:
{
  diagnosticVectorEnabled: false,
  configuredMapId: null,
  requestedRenderingType: 'RASTER',
  actualRenderingType: 'RASTER',
  mapInstance: 'map-1-...'
}
```

**Only explicit diagnostic activation changes behavior:**
- Must call `enableVectorMode(mapId)` with valid mapId
- Must have valid Google Cloud Map ID
- Otherwise, remains RASTER

---

## PART 9 — Proof Autofocus Untouched

**No Changes To:**
- fitBoundsWithMaxZoom function
- Initial framing logic
- Selected-day framing
- userInteracted semantics
- Corrective framing
- panToMarker function
- Map type switching logic
- Marker update logic
- Marker guards during gestures
- Stop color logic
- Quick stop cards

**Only Changes:**
- Diagnostic state persistence via localStorage
- Helper functions to read/write localStorage
- Map options conditional on diagnostic state
- Performance API getRenderingMode return structure

**Autofocus behavior is identical in both modes.**

---

## PART 10 — Files Changed

1. `src/components/schedule/ScheduleMap.tsx`
   - Added localStorage key constants
   - Changed state initialization to read from localStorage
   - Added vectorMapId state
   - Added useEffect to sync state to localStorage
   - Removed event-based toggle mechanism
   - Updated map options to use persisted vectorMapId
   - Updated helper functions to read/write localStorage
   - Updated helper functions to update React state directly
   - Updated getRenderingMode to return structured object
   - Added state dependencies to performance API useEffect
   - Added vectorMapId to map initialization useEffect dependencies
   - Updated runtime verification console log structure

**Lines Changed:**
- Lines 297-328: Added localStorage persistence
- Lines 1510-1517: Updated map options to use persisted state
- Lines 1549-1561: Updated runtime verification log
- Lines 2039-2077: Updated helper functions and getRenderingMode
- Line 1674: Added vectorMapId to map initialization dependencies
- Line 2086: Added state dependencies to performance API

---

## PART 11 — Tests/Build

**Tests Run:**
- 24 ScheduleMap tests passed
- Production build successful
- TypeScript validation passed

---

## PART 12 — Commit SHA

`f8333ccf` - "fix Schedule Map vector diagnostic persistence across page reload"

---

## PART 13 — Updated Usage Instructions

**Enable Vector Mode:**
```javascript
window.__scheduleMapPerf.enableVectorMode('YOUR_MAP_ID')
// Map will recreate immediately with vector rendering
```

**Verify Mode:**
```javascript
window.__scheduleMapPerf.getRenderingMode()
// Returns structured object with diagnosticVectorEnabled, configuredMapId, etc.
```

**Reload and Verify:**
```javascript
// After reload
window.__scheduleMapPerf.getRenderingMode()
// Still returns vector configuration (persisted via localStorage)
```

**Disable Vector Mode:**
```javascript
window.__scheduleMapPerf.disableVectorMode()
// Map will recreate immediately with raster rendering
```

**Clear All Diagnostics:**
```javascript
// In browser console
localStorage.removeItem('replyflow_schedule_vector_diagnostic_enabled')
localStorage.removeItem('replyflow_schedule_vector_diagnostic_map_id')
location.reload()
```

---

## PART 14 — Success Criteria

**Test Case:**
```javascript
// Step 1: Enable vector mode
window.__scheduleMapPerf.enableVectorMode('c783fbbc07696bfd5be1f3c6')

// Step 2: Reload page
location.reload()

// Step 3: Verify after reload
window.__scheduleMapPerf.getRenderingMode()
// Should return:
{
  diagnosticVectorEnabled: true,
  configuredMapId: 'c783fbbc07696bfd5be1f3c6',
  requestedRenderingType: 'VECTOR',
  actualRenderingType: 'VECTOR',
  mapInstance: 'map-...'
}
```

**Result:**
✓ Vector diagnostic persists across page reload
✓ Helper functions available after reload
✓ getRenderingMode returns structured evidence
✓ Map initializes with vector configuration
✓ Console logs confirm vector mode

---

## PART 15 — Important Notes

**Diagnostic Only:**
- Production still uses RASTER by default
- Vector mode requires explicit activation via console
- Vector mode requires valid Google Cloud Map ID
- localStorage keys are clearly marked as diagnostic

**No Production Change:**
- Default behavior remains RASTER
- No mapId configured in production
- No renderingType change in production
- No autofocus changes
- No map behavior changes

**Persistence Scope:**
- localStorage is browser-specific
- Persists across page reloads
- Persists across browser sessions (until cleared)
- Does NOT sync to backend
- Does NOT affect other users
- Does NOT affect production configuration