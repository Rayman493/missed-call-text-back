# Schedule Map Gesture Handling Investigation Report

## PART 1 — Current Configuration

**Actual Current Configuration (line 1456):**
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
  gestureHandling: 'greedy',  // ← ALREADY GREEDY
  styles: [...]
}
```

**Configuration History:**
- Changed to `'greedy'` in commit `78ce6421f` (August 21, 2026)
- Commit message: "fix: improve mobile schedule map controls"
- No other places in the code modify gestureHandling
- No `setOptions` calls found that would override it

**Other Settings:**
- scrollwheel: Not explicitly set (defaults to true)
- draggable: Not explicitly set (defaults to true)
- disableDefaultUI: false
- zoomControl: true
- mapTypeControl: false
- fullscreenControl: false
- clickableIcons: Not explicitly set
- keyboardShortcuts: Not explicitly set
- renderingType: Not explicitly set (uses default)
- fractional zoom: Not explicitly set

---

## PART 2 — Finding: Already Using Greedy Mode

**Key Finding:**
The Schedule Map is **already configured with `gestureHandling: 'greedy'`**, not `'cooperative'` as initially assumed.

**Implications:**
1. The loose feeling is NOT caused by gesture handling configuration
2. Changing to `'greedy'` would have no effect (it's already greedy)
3. The root cause must be elsewhere

**Possible Alternative Causes:**
1. **Parent CSS:** backdrop-blur, filters, transforms on parent elements
2. **React Renders:** Component re-rendering during drag (even with guards)
3. **Canvas Marker Overhead:** Canvas-to-dataURL conversion during icon updates
4. **Selected Marker Size Change:** 36px → 44px transition causing visual swim
5. **ResizeObserver:** Triggering during drag causing layout recalculations
6. **Compositor Layer Issues:** Map and markers not properly GPU-accelerated
7. **Browser/WebView Specifics:** Platform-specific rendering behavior

---

## PART 3 — Recommended Next Steps

Since gestureHandling is already greedy, we should investigate other potential causes:

**Priority 1: Check for React Renders During Drag**
Use the existing instrumentation:
```javascript
// In browser console:
window.__scheduleMapPerf.resetCounters()
// Perform drag
window.__scheduleMapPerf.getGestureRenderCount()
```
If > 0, React is rendering during drag and needs investigation.

**Priority 2: Parent CSS Audit**
Check ScheduleMap parent components for:
- backdrop-blur
- filter
- transform
- opacity
- contain
- will-change
- box-shadow
- border-radius clipping

These can force expensive compositing or repaints.

**Priority 3: Chrome DevTools Performance Trace**
Capture a 5-second drag trace and analyze:
- Main thread time breakdown
- Long tasks (>50ms)
- Frame duration distribution
- Paint/raster/composite costs

**Priority 4: Selected Marker Size A/B Test**
Test all markers at same size (36px) to see if size change causes swim.

**Priority 5: Marker-Only A/B Test**
Temporarily hide all markers to determine if marker rendering is the bottleneck.

---

## PART 4 — No Production Change Made

**Reason:**
The configuration is already `'greedy'`, so changing it would have no effect.

**Commit SHA:**
NONE - No changes made.

---

## PART 5 — Conclusion

The Schedule Map is already configured with the most direct gesture handling mode (`'greedy'`). The reported loose feeling must be caused by something other than gesture handling configuration.

The investigation should now focus on:
1. React render elimination during drag
2. Parent CSS compositing costs
3. Canvas marker rendering overhead
4. Compositor layer behavior
5. Platform-specific rendering issues

---

## Files Changed

NONE

---

## Tests/Build

NONE - No changes made.