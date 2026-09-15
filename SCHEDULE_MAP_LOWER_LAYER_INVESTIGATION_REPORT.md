# Schedule Map Lower Layer Investigation Report

## Summary

Physical diagnostics confirmed:
- gestureRenderCount = 0 (no React renders during drag)
- ops during gesture = [] (no map/marker operations during drag)
- All tracked counters remained 0

**Conclusion:** Application logic is NOT fighting the map during manual navigation. The root cause must be in lower layers: parent CSS/compositing, Google Maps rendering mode, or browser/WebView behavior.

---

## PART 1 — Map Container DOM Structure

**Current DOM Structure (calendar/page.tsx):**

```
<div className="h-[calc(100dvh-160px-var(--bottom-nav-height,80px))] md:h-[calc(100dvh-192px-var(--bottom-nav-height,80px))] min-h-[500px]">
  <ScheduleMap ... />
</div>
```

**Map Container:**
- Element: ScheduleMap internal `div ref={mapRef}`
- Classes: `relative w-full h-full`
- No additional CSS on the map container itself

**Parent Container:**
- Height calculation with CSS variables
- No transform, filter, backdrop-blur on the immediate parent

**Ancestor Chain (to investigate physically):**
1. ScheduleMap internal container
2. Height-calculated div (calendar page)
3. Tab content area
4. Page layout
5. Dashboard shell
6. Root HTML/body

---

## PART 2 — Current Google Maps Configuration

**Exact Current Configuration (lines 1468-1510):**

```typescript
const mapOptions: any = {
  center: initialCenter,
  zoom: initialZoom,
  mapTypeId: initialMapTypeId,  // ROADMAP or HYBRID based on mapType state
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  gestureHandling: 'greedy',  // Already set to greedy
  styles: [...]
}
```

**Key Findings:**
- `mapId: undefined` - NOT set
- `renderingType: undefined` - NOT set (uses default)
- **Rendering Mode: RASTER (default)** - NOT vector
- `gestureHandling: 'greedy'` - Already optimal for direct interaction
- `scrollwheel: true` (default, not explicitly set)
- No fractional zoom configuration
- No tilt or heading

**Raster vs Vector:**
- Default Google Maps uses raster tile rendering
- Vector maps require `mapId` configuration in Google Cloud Console
- Vector maps may provide smoother performance but require configuration

---

## PART 3 — CSS Properties to Audit

**Required Physical Audit:**

For each ancestor from map container to root, check computed values for:

**Suspicious Compositing Properties:**
- `transform` (translate3d, scale, rotate)
- `filter` (blur, contrast, grayscale)
- `backdrop-filter` (blur)
- `opacity` (< 1)
- `perspective`
- `will-change`
- `contain` (strict, content, layout, paint)
- `isolation` (isolate)

**Layout/Clipping Properties:**
- `overflow` (hidden, auto, scroll)
- `border-radius` + `overflow hidden` (creates clipping)
- `box-shadow` (large shadows can be expensive)

**Animation Properties:**
- `transition` (especially `transition-all`)
- `animation`

**Positioning Properties:**
- `position` (fixed, sticky, absolute)
- `z-index`

**How to Audit:**
1. Open Chrome DevTools
2. Select map container (ScheduleMap internal div)
3. Open Elements panel
4. Walk up the DOM tree to root
5. For each ancestor, check Computed Styles
6. Look for the suspicious properties listed above

---

## PART 4 — Suspected Compositing Boundaries (Code Analysis)

**From Code Review:**

**Calendar Page (page.tsx):**
- Tab toggle: `bg-slate-100/50 dark:bg-slate-800/40` (semi-transparent background)
- No transform on immediate parent
- No backdrop-filter on immediate parent
- Disconnected state banner: `backdrop-blur-sm` (line 1800) - but this is conditionally rendered, not during map interaction

**ScheduleMap Component:**
- Map container: `relative w-full h-full` - no suspicious CSS
- No transform, filter, backdrop-filter, will-change
- No opacity < 1
- No isolation or contain

**Potential Issues from Code:**
- Tab toggle semi-transparent backgrounds could create compositing layers
- Height calculation with CSS variables could trigger layout recalculations
- Tab switching could cause layout shifts

---

## PART 5 — Temporary CSS A/B Tests (Guidance)

**Test 1: Remove Tab Toggle Background**
```css
/* Current */
.bg-slate-100/50 dark:bg-slate-800/40

/* Test B */
.bg-transparent
```
**Location:** Tab toggle divs (lines 1228, 1267)

**Test:** Perform slow/fast drag, compare smoothness

---

**Test 2: Remove Height Calculation CSS Variables**
```css
/* Current */
h-[calc(100dvh-160px-var(--bottom-nav-height,80px))]

/* Test B */
h-[calc(100dvh-160px)]
```
**Location:** Map container parent (line 1832)

**Test:** Perform slow/fast drag, compare smoothness

---

**Test 3: Remove Border Radius from Ancestors**
Check if any ancestor has `border-radius` with `overflow: hidden` or `overflow: auto`

**Test:** Perform slow/fast drag, compare smoothness

---

**Test 4: Remove Box Shadows**
Check for large box-shadows on ancestors

**Test:** Perform slow/fast drag, compare smoothness

---

**Test 5: Remove Transitions**
Check for `transition` or `transition-all` on ancestors

**Test:** Perform slow/fast drag, compare smoothness

---

## PART 6 — Google Maps Rendering Mode

**Current Configuration:**
- Raster tiles (default)
- No mapId
- No renderingType specified

**Vector Map Requirements:**
- Requires `mapId` configured in Google Cloud Console
- Requires `renderingType: 'VECTOR'`
- May have billing implications
- May have different WebView support

**Guidance for Vector Map A/B Test:**

**IF** you want to test vector rendering:

1. Create mapId in Google Cloud Console (Google Maps Platform)
2. Update map options:
```typescript
const mapOptions: any = {
  // ... existing options
  mapId: 'YOUR_MAP_ID',  // Required for vector
  renderingType: 'VECTOR'  // Explicit vector
}
```

3. Physical test: slow/fast drag, zoom, compare smoothness

**DO NOT COMMIT** unless:
- Vector rendering is clearly better
- mapId is properly configured
- Billing implications are accepted
- WebView support is verified

---

## PART 7 — Chrome Layers/Paint Flashing Analysis (Guidance)

**Required Physical Test:**

1. Open Chrome DevTools
2. Go to More Tools → Rendering
3. Enable:
   - Paint flashing
   - Layout Shift Regions
   - Layer borders
   - FPS meter

4. Perform 5-second drag

**What to Look For:**
- Does the entire map container repaint during drag?
- Do parent containers repaint during drag?
- Do overlays/cards repaint during drag?
- Are there green/red paint flashes during drag?
- Does the Schedule shell repaint during drag?

**If Painting Occurs:**
- Note which elements are repainting
- Note if painting is full-container or partial
- This indicates compositing/raster overhead

**No React Renders ≠ No Painting:**
Even with zero React renders, the browser may still repaint/raster the map or parent containers due to CSS compositing or Google Maps tile rendering.

---

## PART 8 — Container Size Stability (Guidance)

**Required Physical Test:**

**Using DevTools:**
1. Select map container
2. Open Console
3. Run:
```javascript
const container = document.querySelector('[class*="w-full h-full"]')
const rect = container.getBoundingClientRect()
console.log('Container size:', rect.width, 'x', rect.height)
```

**Or add temporary logging:**
```typescript
// In ScheduleMap useEffect (after map ready)
useEffect(() => {
  if (!mapReady || !mapRef.current) return
  const container = mapRef.current
  const observer = new MutationObserver(() => {
    const rect = container.getBoundingClientRect()
    console.log('[SCHEDULE_MAP_CONTAINER_SIZE]', {
      width: rect.width,
      height: rect.height,
      timestamp: Date.now()
    })
  })
  observer.observe(container, { attributes: true, childList: false, subtree: false, characterData: false })
}, [mapReady])
```

**Test:** Perform drag, check if size changes

---

## PART 9 — Markers (Deferred Per User Guidance)

**Current Status:**
- No marker updates during drag (confirmed by diagnostics)
- Marker updates are guarded during active gestures (line 1768)
- Canvas icons are cached

**Guidance:**
Do NOT prioritize marker changes yet. Only revisit if Chrome Performance trace directly shows:
- Marker image decode cost dominating
- Canvas rasterization cost dominating
- Overlay paint cost dominating

---

## PART 10 — Performance Trace (Guidance)

**Required Physical Trace:**

**Capture Sequence:**
1. 2 sec idle
2. 5 sec drag
3. 2 sec idle
4. Zoom in
5. Zoom out

**Chrome DevTools Performance Tab:**
1. Open Performance tab
2. Click Record
3. Perform sequence
4. Stop recording
5. Analyze drag interval only

**Metrics to Report:**
- Average FPS during drag
- Worst frame duration
- Frames > 16.7ms (60 FPS threshold)
- Frames > 33ms (30 FPS threshold)
- Long tasks > 50ms
- Scripting time
- Rendering time
- Paint time
- Raster time
- Composite time
- GPU activity (if visible)
- Forced layout
- Garbage collection

**Top 10 Costs:**
List the top 10 activities by duration during the drag interval.

---

## PART 11 — No Production Changes Yet

**Status:**
This is an investigation report only. NO production code changes have been made.

**Reason:**
- Application logic is already proven quiet (zero renders, zero ops during drag)
- Root cause must be in lower layers (CSS, rendering mode, browser behavior)
- Physical testing is required to identify the actual bottleneck

---

## PART 12 — Autofocus Safety

**No Changes To:**
- fitBoundsWithMaxZoom
- Selected-day framing
- Initial camera framing
- userInteracted semantics
- Corrective framing
- panToMarker
- Map lifecycle behavior

**Only Changes:**
- Diagnostic logging (previous commit)
- This investigation report

---

## PART 13 — Next Steps for Physical Testing

**Priority 1: CSS/Compositing Audit**
1. Walk DOM tree from map container to root
2. Check computed styles for suspicious properties
3. Perform CSS A/B tests one at a time
4. Document which style (if any) improves smoothness

**Priority 2: Rendering Mode Test**
1. Consider whether vector rendering is worth testing
2. If yes, configure mapId in Google Cloud Console
3. Test vector vs raster with same configuration
4. Document improvement (if any)

**Priority 3: Chrome Layers/Paint Analysis**
1. Enable paint flashing
2. Check for repaints during drag
3. Identify which elements repaint
4. Document findings

**Priority 4: Performance Trace**
1. Capture 5-second drag trace
2. Identify top costs during drag
3. Focus on paint/raster/composite (not scripting)
4. Document findings

---

## PART 14 — Files Changed

NONE - This is an investigation report only.

---

## PART 15 — Commit SHA

NONE - No changes made.

---

## PART 16 — Key Finding

**Google Maps Configuration:**
- Using RASTER rendering (default)
- No mapId configured
- gestureHandling already set to 'greedy'
- This is NOT the issue (already optimal)

**Most Likely Root Causes:**
1. Parent CSS creating compositing overhead
2. Raster tile rendering (vs potentially smoother vector)
3. Browser/WebView specific rendering behavior
4. Container size/Layout instability

---

## PART 17 - Required Physical Testing

To proceed, perform the following:

1. **CSS Audit:** Walk ancestor DOM tree, check computed styles
2. **CSS A/B Tests:** Test one suspicious style at a time
3. **Chrome Layers:** Check for paint flashing during drag
4. **Performance Trace:** Capture drag interval to identify top costs
5. **Container Size:** Verify stability during drag

Only after identifying a specific bottleneck should production code be changed.