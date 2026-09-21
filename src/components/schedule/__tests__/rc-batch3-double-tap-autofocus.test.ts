/**
 * RC Batch 3 — Schedule Map Double-Tap Autofocus Regression Suite
 *
 * Source-inspection tests verifying the marker double-tap → camera-focus
 * interaction contract. Tests verify that:
 * - The marker has a native `dblclick` listener (primary double-tap path)
 * - The `dblclick` listener uses `focusedMarkerIdRef.current` (not stale closure)
 * - The `click` handler's double-tap branch only cancels the single-tap timer
 *   (does NOT call focus — that's delegated to `dblclick`)
 * - The `dblclick` handler cancels the pending single-tap timer
 * - The `dblclick` handler calls `focusStopOnMap` or `unfocusMarker`
 * - The touch-based detector uses `focusedMarkerIdRef.current`
 * - `disableDoubleClickZoom: true` is set so the second tap reaches the marker
 * - Business markers toggle details only (no camera) on double-tap
 * - The touch-based detector cancels the single-tap timer
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8').replace(/\r\n/g, '\n')

describe('RC Batch 3 — Schedule Map Double-Tap Autofocus', () => {
  const source = read('src/components/schedule/ScheduleMap.tsx')

  describe('1. Map configuration — native double-tap zoom disabled', () => {
    it('sets disableDoubleClickZoom: true so the second tap reaches the marker', () => {
      expect(source).toContain('disableDoubleClickZoom: true')
    })

    it('uses gestureHandling: greedy for map pan/zoom', () => {
      expect(source).toContain("gestureHandling: 'greedy'")
    })
  })

  describe('2. Marker has native dblclick listener (primary double-tap path)', () => {
    it('registers a dblclick listener on the marker', () => {
      expect(source).toContain("marker.addListener('dblclick'")
    })

    it('dblclick listener calls focusStopOnMap for non-business markers', () => {
      const dblclickBlock = source.match(/marker\.addListener\('dblclick'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Add hover/)
      expect(dblclickBlock).toBeTruthy()
      expect(dblclickBlock![0]).toContain('focusStopOnMap')
    })

    it('dblclick listener calls unfocusMarker when already focused', () => {
      const dblclickBlock = source.match(/marker\.addListener\('dblclick'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Add hover/)
      expect(dblclickBlock).toBeTruthy()
      expect(dblclickBlock![0]).toContain('unfocusMarker')
    })
  })

  describe('3. dblclick listener uses ref (not stale closure) for focus state', () => {
    it('uses focusedMarkerIdRef.current in the dblclick handler', () => {
      const dblclickBlock = source.match(/marker\.addListener\('dblclick'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Add hover/)
      expect(dblclickBlock).toBeTruthy()
      expect(dblclickBlock![0]).toContain('focusedMarkerIdRef.current')
    })

    it('does NOT use bare focusedMarkerId (stale closure) in the dblclick handler', () => {
      const dblclickBlock = source.match(/marker\.addListener\('dblclick'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Add hover/)
      expect(dblclickBlock).toBeTruthy()
      // The dblclick block should not reference the bare `focusedMarkerId` variable
      // (only the ref version focusedMarkerIdRef.current)
      const bareMatches = dblclickBlock![0].match(/[^.]focusedMarkerId[^R]/g)
      expect(bareMatches).toBeNull()
    })
  })

  describe('4. dblclick handler cancels pending single-tap timer', () => {
    it('clears the single-tap timer in the dblclick handler', () => {
      const dblclickBlock = source.match(/marker\.addListener\('dblclick'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Add hover/)
      expect(dblclickBlock).toBeTruthy()
      expect(dblclickBlock![0]).toContain('singleTapTimerRef.current.get(item.id)')
      expect(dblclickBlock![0]).toContain('clearTimeout(pendingTimer)')
    })

    it('clears lastClickTimeRef in the dblclick handler', () => {
      const dblclickBlock = source.match(/marker\.addListener\('dblclick'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Add hover/)
      expect(dblclickBlock).toBeTruthy()
      expect(dblclickBlock![0]).toContain('lastClickTimeRef.current.delete(item.id)')
    })
  })

  describe('5. click handler double-tap branch is an authoritative detector (iOS)', () => {
    it('click handler still detects double-tap via lastClickTimeRef', () => {
      expect(source).toContain('lastClickTimeRef.current.get(item.id)')
      expect(source).toContain('isDoubleTap')
    })

    it('click handler double-tap branch cancels the single-tap timer', () => {
      // Find the click handler's double-tap branch
      const clickBlock = source.match(/marker\.addListener\('click'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Native marker/)
      expect(clickBlock).toBeTruthy()
      expect(clickBlock![0]).toContain('clearTimeout(pendingTimer)')
    })

    it('click handler double-tap branch performs the focus action (iOS path)', () => {
      const clickBlock = source.match(/marker\.addListener\('click'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Native marker/)
      expect(clickBlock).toBeTruthy()
      // On iOS the marker `dblclick` event is unreliable, so the click pair
      // itself is the authoritative double-tap detector — it must run the
      // focus/unfocus action, deduped against the other detectors.
      expect(clickBlock![0]).toContain('focusStopOnMap')
      expect(clickBlock![0]).toContain('unfocusMarker')
      expect(clickBlock![0]).toContain('lastFocusActionRef')
    })
  })

  describe('6. Single-tap behavior unchanged', () => {
    it('click handler sets a delayed single-tap timer for details toggle', () => {
      expect(source).toContain('toggleMapItemDetails(item.id)')
      expect(source).toContain('DOUBLE_TAP_DELAY_MS')
    })

    it('single-tap timer is stored in singleTapTimerRef', () => {
      expect(source).toContain('singleTapTimerRef.current.set(item.id, timer)')
    })
  })

  describe('7. Touch-based double-tap detector (fallback)', () => {
    it('registers a touchend listener on the map container', () => {
      expect(source).toContain("addEventListener('touchend'")
    })

    it('uses focusedMarkerIdRef.current in the touch handler', () => {
      const touchBlock = source.match(/touchEndHandler = \(e: TouchEvent\)[\s\S]*?\}\s*\n\s*mapRef\.current\.addEventListener/)
      expect(touchBlock).toBeTruthy()
      expect(touchBlock![0]).toContain('focusedMarkerIdRef.current')
    })

    it('cancels the single-tap timer in the touch handler', () => {
      const touchBlock = source.match(/touchEndHandler = \(e: TouchEvent\)[\s\S]*?\}\s*\n\s*mapRef\.current\.addEventListener/)
      expect(touchBlock).toBeTruthy()
      expect(touchBlock![0]).toContain('singleTapTimerRef.current.get(item.id)')
      expect(touchBlock![0]).toContain('clearTimeout(pendingTimer)')
    })

    it('uses a pixel threshold for double-tap detection', () => {
      expect(source).toContain('TOUCH_DOUBLE_TAP_THRESHOLD_PX')
    })

    it('uses a time threshold for double-tap detection', () => {
      expect(source).toContain('DOUBLE_TAP_DELAY_MS')
    })

    it('hit-tests markers by pixel distance to distinguish marker taps from empty-map taps', () => {
      expect(source).toContain('fromLatLngToContainerPixel')
      expect(source).toContain('nearestKey')
    })

    it('only processes single-finger taps (not multi-touch)', () => {
      expect(source).toContain('e.touches.length > 0')
    })
  })

  describe('8. Business marker behavior unchanged on double-tap', () => {
    it('dblclick handler toggles details only for business markers (no camera)', () => {
      const dblclickBlock = source.match(/marker\.addListener\('dblclick'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Add hover/)
      expect(dblclickBlock).toBeTruthy()
      expect(dblclickBlock![0]).toContain("item.type !== 'business'")
      expect(dblclickBlock![0]).toContain('toggleMapItemDetails(item.id)')
    })
  })

  describe('9. Focus helper reuse (no duplicate camera implementation)', () => {
    it('reuses focusStopOnMap as the canonical focus helper', () => {
      expect(source).toContain('const focusStopOnMap = (itemId: string, latitude: number | null, longitude: number | null) =>')
    })

    it('focusStopOnMap uses panToMarker with force: true', () => {
      expect(source).toContain("panToMarker(latitude, longitude, { zoom: targetZoom, force: true }, 'focus_stop_on_map')")
    })

    it('focusStopOnMap targets zoom level 16 minimum', () => {
      expect(source).toContain('Math.max(currentZoom, 16)')
    })
  })

  describe('10. No duplicate camera calls / jitter', () => {
    it('click handler does not call panToMarker directly', () => {
      const clickBlock = source.match(/marker\.addListener\('click'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Native marker/)
      expect(clickBlock).toBeTruthy()
      expect(clickBlock![0]).not.toContain('panToMarker')
    })

    it('only one definition of focusStopOnMap exists', () => {
      const matches = source.match(/const focusStopOnMap =/g)
      expect(matches).toBeTruthy()
      expect(matches!.length).toBe(1)
    })

    it('no setTimeout-based camera workaround in dblclick handler', () => {
      const dblclickBlock = source.match(/marker\.addListener\('dblclick'[\s\S]*?\}\s*\)\s*\n\s*\/\/ Add hover/)
      expect(dblclickBlock).toBeTruthy()
      // The dblclick handler should not use setTimeout for camera work.
      // The only setTimeout allowed is the 50ms suppressMapClickRef guard.
      const setTimeoutMatches = dblclickBlock![0].match(/setTimeout\(/g)
      expect(setTimeoutMatches).toBeTruthy()
      // Should have exactly one setTimeout (the suppressMapClickRef guard)
      expect(setTimeoutMatches!.length).toBe(1)
      expect(dblclickBlock![0]).toContain('suppressMapClickRef.current = false')
      // Should NOT contain setTimeout-based camera calls (panTo/setZoom/fitBounds inside setTimeout)
      expect(dblclickBlock![0]).not.toMatch(/setTimeout\([^)]*panTo/)
      expect(dblclickBlock![0]).not.toMatch(/setTimeout\([^)]*setZoom/)
      expect(dblclickBlock![0]).not.toMatch(/setTimeout\([^)]*fitBounds/)
    })
  })

  describe('11. Day-load auto-fit unchanged', () => {
    it('auto-frame effect still calls fitBoundsWithMaxZoom for context changes', () => {
      expect(source).toContain("fitBoundsWithMaxZoom(bounds, MULTI_MARKER_MAX_ZOOM, padding, 'auto_frame')")
    })

    it('auto-frame respects userInteractedForContextRef', () => {
      expect(source).toContain('!userInteractedForContextRef.current')
    })

    it('auto-frame respects activeGestureRef', () => {
      expect(source).toContain('!activeGestureRef.current')
    })
  })

  describe('12. Empty-map double-tap preserves existing map behavior', () => {
    it('touch handler returns early if no nearest marker is found', () => {
      expect(source).toContain('if (!nearestKey) return')
    })

    it('no map-level dblclick listener that would intercept empty-map double-taps', () => {
      // The map should NOT have a map.addListener('dblclick', ...) that would
      // globally intercept double-taps on empty map space
      expect(source).not.toContain("map.addListener('dblclick'")
    })
  })

  describe('13. Two taps on different markers are not treated as one double tap', () => {
    it('click handler uses per-marker lastClickTimeRef keyed by item.id', () => {
      expect(source).toContain('lastClickTimeRef.current.get(item.id)')
      expect(source).toContain('lastClickTimeRef.current.set(item.id, now)')
    })

    it('touch handler hit-tests by pixel distance to find the correct marker', () => {
      expect(source).toContain('nearestKey')
      expect(source).toContain('nearestDist')
    })
  })

  describe('14. focusedMarkerId ref mirror is kept in sync', () => {
    it('focusedMarkerIdRef is updated when focusedMarkerId state changes', () => {
      expect(source).toContain('focusedMarkerIdRef.current = focusedMarkerId')
    })
  })
})
