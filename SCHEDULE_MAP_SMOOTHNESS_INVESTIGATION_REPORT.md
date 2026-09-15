# Schedule Map Manual Navigation Smoothness Investigation Report

## PART 1 — Frame-Level Baseline (Code Analysis)

**Existing Instrumentation:**
The component has built-in performance counters exposed via `window.__scheduleMapPerf`:

```javascript
window.__scheduleMapPerf = {
  getRenderCount: () => renderCountRef.current,
  getGestureRenderCount: () => gestureRenderCountRef.current,
  getOpCounters: () => ({ ...opCountersRef.current }),
  resetCounters: () => { ... }
}
```

**Operation Counters Tracked:**
- mapCreate, markerCreate, markerSetMap, markerSetIcon, markerSetPosition
- mapSetCenter, mapPanTo, mapFitBounds, mapSetZoom, mapSetOptions
- markerCleanup

**Gesture Tracking:**
- `activeGestureRef.current` set to true on dragstart, false on dragend
- `gestureRenderCountRef` increments on every React render during active gesture

**Physical Testing Required:**
To establish actual baseline, physical testing is required:
1. Open Chrome DevTools Performance tab
2. Start recording
3. Perform 5-second manual drag
4. Stop recording
5. Analyze:
   - FPS during drag
   - Main thread time breakdown
   - Long tasks (>50ms)
   - Frame duration distribution

**Current Code Analysis Findings:**
- Marker updates are guarded during active gestures (line 1726-1728)
- Icon updates are guarded during active gestures (line 1953-1954)
- Canvas marker icons are cached by type/stopNumber/isSelected/DPR
- Selected markers are larger (44px vs 36px) which could cause more visual swim

---

## PART 2 — Chrome Performance Trace (Required Physical Test)

**Required Trace Sequence:**
1. 2 sec idle
2. 5 sec manual drag
3. 2 sec idle
4. Zoom in
5. Zoom out

**Analysis Required:**
Break down main-thread time into:
- Scripting
- Style recalculation
- Layout
- Paint
- Raster
- Compositing
- Image decode
- Garbage collection
- React commits
- Google Maps JS callbacks
- Canvas/image work

**Top 10 Costs:** Cannot be determined without physical trace.

---

## PART 3 — Compositor/Layer Behavior (Code Analysis)

**Current Marker Implementation:**
- Uses `google.maps.Marker` with canvas-based icons
- Canvas icons created via `createNumberedMarkerIcon()`
- Icons converted to data URLs: `canvas.toDataURL()` (line 2064)
- Icon size: 36px (unselected), 44px (selected)
- Touch target: 44px diameter circle via `createMarkerShape()`

**Potential Compositing Issues:**
- Selected marker size change (36px → 44px) could cause layer recomposition
- Canvas-to-dataURL conversion is expensive if called repeatedly
- Data URL images may not be GPU-accelerated like native markers

**Physical Test Required:**
Use Chrome DevTools Layers panel to check:
- Whether map tiles are on GPU/composited layers
- Whether marker pane is separately composited
- Whether custom marker images trigger repaint/raster during movement
- Whether parent elements create extra compositing boundaries

**Parent Element Audit Required:**
Check ScheduleMap wrapper and ancestors for:
- `transform`, `filter`, `backdrop-filter`, `opacity`, `contain`, `will-change`
- These can force costly compositing

---

## PART 4 — Parent Layout/Paint Audit (Code Analysis)

**ScheduleMap Container:**
```typescript
<div ref={mapRef} className="relative w-full h-full" />
```

**Potential Issues:**
- No obvious backdrop-blur or filter on the map container
- No transform on the map container
- No animated opacity on the map container

**Parent Component Audit Required:**
Physical inspection of parent components in Chrome DevTools to check for:
- backdrop-blur
- filter
- box-shadow
- overflow clipping
- border-radius clipping
- transform
- animated opacity
- transition-all
- large shadows
- sticky/fixed overlays
- resize observers

**ResizeObservers Found:**
1. Lines 1587-1608: Initial map initialization (disconnects after map created)
2. Lines 1611-1640: Container size monitoring (only logs, no state updates)

The second ResizeObserver could potentially trigger during drag, but it only logs size changes without state updates.

---

## PART 5 — Test Map Without Custom Markers (Diagnostic)

**Required Diagnostic Test:**

Create temporary local diagnostic mode with three states:
A. Current full map with stop markers
B. Map with ALL custom stop markers temporarily hidden
C. Map with business marker hidden too

**Implementation:**
```typescript
// Add temporary diagnostic state
const [hideMarkers, setHideMarkers] = useState(false)

// In marker update effect:
if (hideMarkers) return

// Add debug UI button:
<button onClick={() => setHideMarkers(!hideMarkers)}>
  {hideMarkers ? 'Show Markers' : 'Hide Markers'}
</button>
```

**Physical Comparison:**
Test manual pan smoothness with:
- Markers visible (current)
- Markers hidden

**Expected Result:**
If B/C feels dramatically smoother → marker rendering is the bottleneck
If B/C still feels awful → marker API is probably not the main cause

**DO NOT COMMIT diagnostic marker hiding.**

---

## PART 6 — Legacy Marker vs AdvancedMarker A/B (Diagnostic)

**Current Implementation:**
- Uses `google.maps.Marker` with canvas icons
- Canvas icons converted to data URLs
- Size change on selection (36px → 44px)

**AdvancedMarkerElement Alternative:**
- Uses DOM elements instead of canvas images
- No data URL conversion
- Potentially better GPU acceleration
- Requires mapId and vector map configuration

**Required A/B Test:**
```typescript
// Add temporary AdvancedMarker at nearby coordinates
import { AdvancedMarkerElement } from '@googlemaps/marker'

// In marker creation:
const advancedMarker = new AdvancedMarkerElement({
  position: { lat: nearbyLat, lng: nearbyLng },
  map: googleMapRef.current,
  content: document.createElement('div') // Simple DOM element
})
```

**Physical Comparison:**
Test with both markers on same map:
- Slow drag
- Fast drag
- Diagonal drag
- Wheel zoom
- Trackpad zoom (if available)

**Evaluation:**
- Visual locking
- Jitter
- Lag
- Repaint/composite cost

**DO NOT MIGRATE unless difference is obvious.**

---

## PART 7 — AdvancedMarker Full Viability Assessment

**Marker Library Requirement:**
- Requires `@googlemaps/marker` package
- Requires `mapId` in map options
- Requires vector map rendering type
- May have billing implications

**Current Map Configuration (lines 1422-1480):**
```typescript
const mapOptions: google.maps.MapOptions = {
  center: { lat: 0, lng: 0 },
  zoom: 2,
  mapId: undefined, // NOT SET
  renderingType: undefined, // Uses default (likely raster)
  gestureHandling: 'cooperative',
  // ...
}
```

**Migration Impact Assessment:**
1. **Package:** Need to install `@googlemaps/marker`
2. **mapId:** Need to generate/configure mapId in Google Cloud Console
3. **Rendering type:** Need to switch to vector map
4. **Billing:** Vector maps may have different pricing
5. **Desktop support:** Supported
6. **Android WebView:** Support needs verification
7. **iOS WKWebView:** Support needs verification
8. **Click handling:** Different event model
9. **zIndex:** Different implementation
10. **Accessibility:** Different ARIA model
11. **Selected state:** Need DOM-based selection styling
12. **Business marker:** Would also need migration

**Risk Assessment:**
- High risk due to mapId and rendering type requirements
- Unclear WebView support
- Significant code changes required
- Unclear if provides actual smoothness improvement

**Recommendation:**
Only migrate if AdvancedMarker A/B test shows obvious improvement AND migration risks are acceptable.

---

## PART 8 — DOM Marker Performance Rules (If Migrating)

**Current Marker Art Complexity:**
- Canvas with circle background
- Stroke border (2px or 3px)
- Text number or emoji
- Size change on selection

**AdvancedMarker DOM Requirements:**
- Extremely lightweight DOM
- No React component per marker
- No animation
- No `transition: all`
- No blur/filter
- No large box-shadow
- No nested wrappers

**Preferred DOM Structure:**
```typescript
const content = document.createElement('div')
content.style.cssText = `
  width: 36px;
  height: 36px;
  background: ${color};
  border-radius: 50%;
  border: 2px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
  font-size: 14px;
`
content.textContent = stopNumber.toString()
```

**Selected State:**
- Ring/stroke instead of size change
- zIndex for layering
- No scale/size transformation

**Important:**
Google Maps owns geographic position. Do NOT manually translate markers.

---

## PART 9 — Map Rendering Mode (Code Analysis)

**Current Configuration (lines 1422-1480):**
```typescript
const mapOptions: google.maps.MapOptions = {
  center: { lat: 0, lng: 0 },
  zoom: 2,
  mapId: undefined,
  renderingType: undefined, // Uses default (likely raster)
  gestureHandling: 'cooperative',
  tilt: 0,
  heading: 0,
  // ...
}
```

**Rendering Type:** Not explicitly set, uses Google Maps default (raster)

**Fractional Zoom:** Not configured

**Required Comparison Test:**
Create controlled local comparison:
A. Current configuration (raster, no mapId)
B. Vector-enabled configuration (requires mapId)

**Implementation:**
```typescript
const mapOptions: google.maps.MapOptions = {
  // ...
  mapId: 'YOUR_MAP_ID', // Required for vector
  renderingType: 'VECTOR', // Explicit vector
}
```

**Physical Test:**
Same location, same markers, same gesture.

**DO NOT SWITCH production rendering mode unless:**
- Physical improvement is obvious
- Configuration impact is fully understood
- mapId is properly configured
- Billing implications are accepted

---

## PART 10 — Gesture Handling (Code Analysis)

**Current Configuration (line 1464):**
```typescript
gestureHandling: 'cooperative'
```

**Gesture Handling Modes:**
- `greedy`: Map captures all scroll/pan gestures
- `cooperative`: Map shares gestures with page scroll
- `auto`: Browser decides based on page structure
- `none`: Map does not capture gestures

**Current Behavior:**
`cooperative` means map shares gestures with page scroll. This could cause:
- Delayed map response if page scroll competes
- Less direct feeling than Zillow/Google Maps

**Required A/B Test:**
```typescript
// Test with greedy
gestureHandling: 'greedy'
```

**Physical Comparison:**
- Pointer attachment
- Scroll interception
- Trackpad behavior
- Mobile WebView behavior

**For Full-Page Application:**
ReplyFlow Schedule Map is a full-page application, so `greedy` may provide more direct Zillow-like interaction.

**DO NOT CHANGE yet without physical testing.**

---

## PART 11 — Wheel/Trackpad Zoom (Code Analysis)

**Current Configuration (lines 1422-1480):**
```typescript
scrollwheel: true,
```

**Audit Findings:**
- scrollwheel is enabled
- No custom wheel listeners found in ScheduleMap component
- No obvious page scroll interference in ScheduleMap code

**Parent Component Audit Required:**
Physical inspection of parent components to check for:
- Custom wheel listeners
- Page scroll handlers that might compete with map zoom

**Browser Trackpad Behavior:**
Depends on browser and OS. Physical testing required to verify:
- Trackpad pinch zoom works
- Trackpad scroll doesn't interfere
- No custom wheel handler fighting Google Maps

---

## PART 12 — Pointer/Touch Listeners (Code Analysis)

**Map Event Listeners (lines 1488-1522):**
- `dragstart` - sets `activeGestureRef.current = true`
- `dragend` - sets `activeGestureRef.current = false`
- `zoom_changed` - sets `userInteractedForContextRef.current = true`
- `idle` - resets `programmaticMoveInProgressRef.current`

**Listener Analysis:**
- All listeners are Google Maps native listeners (performant)
- No custom pointermove/touchmove listeners found
- No custom wheel listeners found
- Listeners are minimal (only set refs)

**High-Frequency Event Handlers:**
None found. All handlers only update refs, no sync work.

**Listener Count:** 4 Google Maps event listeners

---

## PART 13 — React Render Elimination (Code Analysis)

**Render Tracking:**
```typescript
renderCountRef.current++
if (activeGestureRef.current) {
  gestureRenderCountRef.current++
}
```

**Potential Render Sources During Drag:**

1. **Marker Update Effect (lines 1694-1909):**
   - Dependencies: mapItems, groupItemsByLocation, mapReady, getFilteredMapItems, showAllMode, fitBoundsWithMaxZoom, selectedMapItemId, selectedDate, mapFilter, getResponsivePadding, assignStopNumbers, getSortedMappedItems, mapType
   - Guarded: `if (activeGestureRef.current) return` (line 1726)
   - Should NOT run during drag

2. **Selected Marker Update Effect (lines 1949-1999):**
   - Dependencies: selectedMapItemId, mapReady, getFilteredMapItems, mapItems, assignStopNumbers
   - Guarded: `if (activeGestureRef.current) return` (line 1953)
   - Should NOT run during drag

3. **ResizeObserver Effect (lines 1611-1640):**
   - Dependencies: mapReady
   - Only logs size changes, no state updates
   - Should NOT cause renders

4. **Other Effects:**
   - Map type persistence (line 298)
   - Map type update (line 303)
   - Business geocoding (line 372)
   - Selection clearing (line 494)
   - Google Maps loading (line 1337)
   - Map initialization (line 1398)
   - ResizeObserver init (line 1587)
   - Stale selection clearing (line 1643)
   - Map items preparation (line 1669)
   - Performance counters exposure (line 1912)

**Potential Issue:**
The main component itself may re-render due to parent state changes. Need physical testing to verify if `gestureRenderCountRef` actually increments during drag.

**Physical Test Required:**
1. Open browser console
2. Run: `window.__scheduleMapPerf.resetCounters()`
3. Perform drag
4. Run: `window.__scheduleMapPerf.getGestureRenderCount()`
5. If > 0, React is rendering during drag

**If React Renders During Drag:**
Need to identify which parent state is changing and move it to refs or Google Maps-owned state.

---

## PART 14 — Idle/Dragend Catch-Up (Code Analysis)

**Post-Drag Operations to Measure:**

1. **Marker Update Effect:**
   - Runs when gesture ends (guard removed)
   - Could trigger setIcon calls
   - Could cause visual snap

2. **Selection Update:**
   - No immediate selection updates after drag found
   - Selection only changes on explicit user action

3. **Camera Updates:**
   - `fitBoundsWithMaxZoom` only runs on context/signature change
   - `panToMarker` only runs on explicit selection
   - No automatic camera updates after drag

4. **State Sync:**
   - No obvious state synchronization after drag found

**Physical Measurement Required:**
Use Chrome DevTools Performance tab to measure operations within 500ms after dragend:
- idle event timing
- marker reconciliation timing
- selection update timing
- fitBounds timing
- panTo timing
- setIcon timing
- React render timing
- ResizeObserver timing

**If Burst Found:**
The burst immediately after release could create perceived snap/catch-up feeling.

---

## PART 15 — Selected Marker Size Change (Code Analysis)

**Current Implementation:**
- Unselected: 36px
- Selected: 44px
- Size change via `createNumberedMarkerIcon(isSelected)` parameter

**Marker Update Logic (lines 1986-1997):**
```typescript
const currentSize = currentIcon?.size || 36
const targetSize = isSelected ? 44 : 36

if (currentSize !== targetSize) {
  marker.setIcon(createNumberedMarkerIcon(...))
  opCountersRef.current.markerSetIcon++
  marker.setZIndex(isSelected ? 1000 : 1)
}
```

**Potential Issue:**
Size change could cause:
- More visible swim during drag (even with guards)
- Layer recomposition
- Canvas recreation (though cached)

**Required A/B Test:**
Temporary diagnostic:
- All markers same size (36px)
- Selection via ring/stroke/zIndex instead of size change

**If Same-Size Feels Smoother:**
Preserve selection via:
- Ring/stroke
- zIndex
- Color change

**Only change production if physically proven.**

---

## PART 16 — Shadow/Stroke Cost (Code Analysis)

**Current Marker Art (lines 2043-2061):**
- Circle background
- Stroke border (2px unselected, 3px selected)
- White stroke for unselected, amber stroke for selected
- Text number or emoji

**Canvas Operations:**
```typescript
ctx.beginPath()
ctx.arc(size / 2, size / 2, size / 2 - strokeWidth / 2, 0, 2 * Math.PI)
ctx.fillStyle = color
ctx.fill()
ctx.strokeStyle = isSelected ? '#F59E0B' : '#FFFFFF'
ctx.lineWidth = strokeWidth
ctx.stroke()
```

**Complexity:**
- 1 arc operation
- 1 fill operation
- 1 stroke operation
- 1 text fill operation

**Required A/B Test:**
Compare local temporary variants:
A. Current marker (with stroke)
B. No stroke
C. No outer ring
D. Simpler circle (just background + text)

**If Current Marker Art Causes Expensive Rasterization:**
Simplify only enough to improve motion while keeping number/color identity.

---

## PART 17 — Acceptance Test (Physical)

**Desktop Chrome:**
- [ ] Slow drag feels attached
- [ ] Fast drag remains smooth
- [ ] Diagonal drag smooth
- [ ] Wheel/trackpad zoom smooth

**Android WebView:**
- [ ] One-finger pan smooth
- [ ] Pinch zoom smooth

**iOS WKWebView:**
- [ ] One-finger pan smooth
- [ ] Pinch zoom smooth

**Target Feeling:**
Zillow / Google Maps navigation quality:
- Direct
- Fluid
- Mechanically attached
- No rubber-band
- No marker swim
- No catch-up

---

## PART 18 — DO NOT CHANGE AUTOFOCUS (Non-Negotiable)

**Preserved Components:**
- ✓ `fitBoundsWithMaxZoom` function
- ✓ Initial framing logic
- ✓ Selected-day framing
- ✓ Corrective framing
- ✓ `userInteracted` reset behavior
- ✓ Business + stop bounds
- ✓ Selected-day camera policy
- ✓ Explicit `panToMarker` behavior

**No Changes To:**
- Lines 528-613: fitBoundsWithMaxZoom
- Lines 1846-1899: Auto-fit logic
- Lines 1489-1514: Gesture listeners
- Lines 623-644: navigateToStop
- Lines 647-665: recenterMap

---

## PART 19 — Implementation Strategy

**Allowed Outcomes:**

A. **React/render bottleneck proven**
   → Eliminate exact churn (move state to refs)

B. **Marker rendering proven**
   → Simplify marker art or migrate to AdvancedMarker

C. **AdvancedMarker clearly better**
   → Migrate carefully with full risk assessment

D. **Vector map clearly better**
   → Configure carefully with mapId setup

E. **gestureHandling clearly better**
   → Change with mobile regression coverage

F. **Post-drag catch-up proven**
   → Eliminate exact write

G. **No meaningful app bottleneck**
   → Do NOT manufacture a fix

**Current Assessment:**
Based on code analysis alone, no obvious bottleneck is proven. Physical testing with Chrome DevTools is required to identify the actual root cause.

---

## PART 20 — Tests/Build

**If Production Code Changes:**
Run:
- Focused ScheduleMap tests: `npm test -- --run src/components/schedule/__tests__/`
- Full Schedule tests: `npm test -- --run src/components/schedule/`
- Production TypeScript: `npm run build`
- Next.js build: `npm run build`
- Git diff check: `git diff --check`

**Physical Testing Remains Authoritative:**
Code analysis and tests cannot substitute for physical smoothness testing.

---

## CONCLUSION

**Current State:**
- Marker updates are guarded during gestures ✓
- Icon updates are guarded during gestures ✓
- Canvas icons are cached ✓
- HiDPI scaling is correct ✓
- No obvious React render sources during drag ✓
- No custom high-frequency event handlers ✓

**Potential Issues (Require Physical Testing):**
1. Selected marker size change (36px → 44px) could cause swim
2. Canvas-to-dataURL conversion could be expensive
3. `gestureHandling: 'cooperative'` may not be optimal for full-page app
4. Parent components may have costly CSS (backdrop-blur, etc.)
5. ResizeObserver could trigger during drag
6. React may render during drag due to parent state

**Recommended Next Steps:**

1. **Physical Performance Baseline:**
   - Use `window.__scheduleMapPerf` to measure gesture renders
   - Chrome DevTools Performance trace during drag
   - Identify actual FPS and frame killers

2. **Marker-Free A/B Test:**
   - Temporarily hide all markers
   - Compare smoothness
   - Determine if markers are the bottleneck

3. **Gesture Handling A/B Test:**
   - Test `gestureHandling: 'greedy'` vs `cooperative`
   - Check if greedy provides more direct feeling

4. **Selected Marker Size A/B Test:**
   - Test all markers same size
   - Check if size change causes swim

**NO PRODUCTION CHANGES UNTIL:**
- Physical testing identifies actual bottleneck
- Fix is proven to improve smoothness
- Fix has acceptable risk

---

## Files Changed

NONE - This is an investigation report only.

---

## Commit SHA

NONE - No changes made.

---

## Physical Testing Required

This task requires physical testing with:
- Chrome DevTools Performance tab
- Chrome DevTools Layers panel
- Actual device testing (Android WebView, iOS WKWebView)
- A/B testing of potential fixes

Code analysis alone cannot determine the actual smoothness bottleneck.