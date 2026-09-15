# Schedule Map Lower Layer Investigation - Summary

## Physical Diagnostic Results (Authoritative)

After physical testing with the enhanced diagnostics:
- `gestureRenderCount = 0` - No React renders during drag
- `ops during gesture = []` - No map/marker operations during drag
- All tracked counters remained 0

**Conclusion:** Application logic is NOT fighting the map during manual navigation.

---

## Code Analysis Findings

### 1. Map Container DOM Structure
```
<div className="h-[calc(100dvh-160px-var(--bottom-nav-height,80px))] md:h-[calc(100dvh-192px-var(--bottom-nav-height,80px))] min-h-[500px]">
  <ScheduleMap>
    <div ref={mapRef} className="relative w-full h-full">
      <!-- Google Map -->
    </div>
  </ScheduleMap>
</div>
```

**CSS Analysis:**
- Map container: `relative w-full h-full` - No transform, filter, backdrop-blur, will-change
- Parent container: Height calculation with CSS variables - No transform, filter, backdrop-blur
- Tab toggle: Semi-transparent backgrounds (`bg-slate-100/50 dark:bg-slate-800/40`) - No transform, filter
- **No backdrop-blur on map ancestors**
- **No transform on map ancestors**
- **No filter on map ancestors**

### 2. Google Maps Configuration
```typescript
const mapOptions: any = {
  center: initialCenter,
  zoom: initialZoom,
  mapTypeId: initialMapTypeId,
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  gestureHandling: 'greedy',  // Already optimal
  // mapId: undefined  // NOT set
  // renderingType: undefined  // NOT set (uses default raster)
}
```

**Key Finding:**
- **Rendering Mode: RASTER** (default, not vector)
- gestureHandling already set to 'greedy' (optimal for direct interaction)
- No mapId configured (required for vector maps)

### 3. Global Styles
- `backdrop-blur-xl` exists on `premium-card` classes
- These classes are NOT used on map ancestors
- Map container chain does not use premium-card classes

---

## Most Likely Root Causes

Based on elimination of React/app-layer causes, the poor manual navigation feel is likely caused by:

### Priority 1: Google Maps Raster Rendering
- Default Google Maps uses raster tile rendering
- Raster tiles may not feel as smooth as vector maps
- Zillow/Google Maps modern implementations often use vector rendering
- **Action:** Test vector rendering if mapId can be safely configured

### Priority 2: Browser/WebView Specific Behavior
- Different browsers handle map rendering differently
- Android WebView and iOS WKWebView may have different performance characteristics
- **Action:** Test on different devices/browsers to isolate platform-specific issues

### Priority 3: Container Size/Layout Stability
- Height calculation with CSS variables could cause layout recalculations
- **Action:** Verify container size doesn't change during drag

### Priority 4: Browser Compositor Behavior
- Even without CSS compositing boundaries, the browser compositor may introduce overhead
- **Action:** Chrome Performance trace to identify compositor costs

---

## Recommended Physical Testing Sequence

### Step 1: Verify Container Size Stability
```javascript
// In browser console during drag
const container = document.querySelector('[class*="w-full h-full"]')
setInterval(() => {
  const rect = container.getBoundingClientRect()
  console.log('Size:', rect.width, 'x', rect.height)
}, 100)
```

### Step 2: Chrome Layers/Paint Flashing
1. Open Chrome DevTools → More Tools → Rendering
2. Enable: Paint flashing, Layer borders, FPS meter
3. Perform 5-second drag
4. Check for repaints during drag

### Step 3: Chrome Performance Trace
1. Open Chrome DevTools → Performance
2. Record: 2 sec idle → 5 sec drag → 2 sec idle → zoom
3. Analyze drag interval only
4. Report: FPS, frame duration, top 10 costs, paint/raster/composite time

### Step 4: Vector Rendering A/B Test (Optional)
If you have access to configure mapId in Google Cloud Console:
1. Create mapId
2. Add `mapId: 'YOUR_MAP_ID'` and `renderingType: 'VECTOR'` to map options
3. Test slow/fast drag, compare smoothness
4. **DO NOT COMMIT** unless improvement is obvious and safe

---

## CSS A/B Tests (Low Priority)

Based on code analysis, there are no obvious CSS compositing boundaries on the map ancestors. However, if Chrome paint flashing shows repaints, test:

1. Remove semi-transparent backgrounds from tab toggle
2. Simplify height calculation (remove CSS variables)
3. Remove border-radius from ancestors

These are **low priority** because the code analysis shows no obvious CSS issues.

---

## No Production Changes Recommended Yet

**Reason:**
- Application layer is already proven quiet (zero renders, zero ops)
- Code analysis shows no obvious CSS compositing issues
- Root cause is likely in Google Maps rendering mode or browser/WebView behavior
- Physical testing with Chrome DevTools is required to identify actual bottleneck

---

## Files Changed

NONE - This is an investigation summary only.

---

## Commit SHA

NONE - No changes made.

---

## Key Recommendation

**Most Promising Lead:**
The map is using raster tile rendering (Google Maps default). Modern map implementations like Zillow and Google Maps itself use vector rendering, which may provide smoother manual navigation.

**Next Action:**
If you can safely configure a mapId in Google Cloud Console, test vector rendering. Otherwise, perform Chrome Performance trace to identify the actual bottleneck in the rendering pipeline.

---

## Autofocus Safety

No changes to autofocus, framing, or camera logic.