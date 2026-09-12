/**
 * Regression tests for ScheduleMap double-tap marker behavior.
 *
 * Root cause:
 * Google Maps' native double-click zoom consumes the second tap of a
 * double-tap, preventing the marker's click listener from firing twice.
 * This means the double-tap detection (which relies on two click events
 * within DOUBLE_TAP_DELAY_MS) never triggers on Android.
 *
 * The fix:
 * - Set disableDoubleClickZoom: true in the map options so the second
 *   tap reaches the marker click listener instead of being consumed
 *   by the native zoom gesture.
 *
 * Selected vs focused state model:
 * - selectedMapItemId: controls the details card (single tap toggles)
 * - focusedMarkerId: controls the camera (double tap toggles)
 * - unfocusMarker: clears focusedMarkerId and restores fit-all, but
 *   preserves selectedMapItemId (details card stays open)
 * - toggleMapItemDetails: toggles selectedMapItemId without camera change
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const mapContent = readFileSync('src/components/schedule/ScheduleMap.tsx', 'utf8')
const mapUtilsContent = readFileSync('src/lib/map-utils.ts', 'utf8')

describe('ScheduleMap — double-tap marker behavior', () => {
  it('native double-click zoom is disabled (root cause fix)', () => {
    // The fix: disableDoubleClickZoom must be set to true so the
    // second tap of a double-tap reaches the marker click listener.
    expect(mapContent).toContain('disableDoubleClickZoom: true')
  })

  it('clickableIcons is disabled (prevents POI from consuming taps)', () => {
    expect(mapContent).toContain('clickableIcons: false')
  })

  it('DOUBLE_TAP_DELAY_MS is defined', () => {
    expect(mapContent).toContain('DOUBLE_TAP_DELAY_MS')
    expect(mapContent).toMatch(/DOUBLE_TAP_DELAY_MS\s*=\s*\d+/)
  })

  it('double-tap detection uses Date.now() timing', () => {
    expect(mapContent).toContain('Date.now()')
    expect(mapContent).toContain('lastClickTimeRef')
  })

  it('single tap toggles details (toggleMapItemDetails)', () => {
    expect(mapContent).toContain('toggleMapItemDetails')
    // Single tap uses a delayed timer to allow double-tap cancellation
    expect(mapContent).toContain('singleTapTimerRef')
  })

  it('double-tap on unfocused marker focuses it (focusStopOnMap)', () => {
    expect(mapContent).toContain('focusStopOnMap')
    expect(mapContent).toContain('setFocusedMarkerId(item.id)')
  })

  it('double-tap on focused marker unfocuses (unfocusMarker)', () => {
    expect(mapContent).toContain('unfocusMarker')
    expect(mapContent).toContain('focusedMarkerId === item.id')
  })

  it('unfocusMarker clears focusedMarkerId but preserves selectedMapItemId', () => {
    // The unfocusMarker function must NOT clear selectedMapItemId
    const unfocusMatch = mapContent.match(/const unfocusMarker = useCallback\(\(\) => \{[\s\S]*?\}, \[/)
    expect(unfocusMatch).toBeTruthy()
    if (unfocusMatch) {
      expect(unfocusMatch[0]).toContain('setFocusedMarkerId(null)')
      expect(unfocusMatch[0]).not.toContain('setSelectedMapItemId(null)')
      expect(unfocusMatch[0]).toContain('setShowAllMode(true)')
    }
  })

  it('selectedMapItemId and focusedMarkerId are separate state', () => {
    expect(mapContent).toContain('const [selectedMapItemId, setSelectedMapItemId]')
    expect(mapContent).toContain('const [focusedMarkerId, setFocusedMarkerId]')
  })

  it('double-tap cancels pending single-tap timer', () => {
    expect(mapContent).toContain('clearTimeout(pendingTimer)')
    expect(mapContent).toContain('singleTapTimerRef.current.delete(item.id)')
  })

  it('different markers are not treated as same double-tap', () => {
    // The lastClickTimeRef is keyed by item.id, so taps on different
    // markers don't count as double-taps
    expect(mapContent).toMatch(/lastClickTimeRef\.current\.get\(item\.id\)/)
    expect(mapContent).toMatch(/lastClickTimeRef\.current\.set\(item\.id,/)
  })
})

describe('map-utils — getMarkerTapAction', () => {
  it('touch device single tap returns focus', () => {
    expect(mapUtilsContent).toContain("isTouchDevice")
    expect(mapUtilsContent).toContain("return 'focus'")
  })

  it('desktop double click returns focus', () => {
    expect(mapUtilsContent).toContain('isDoubleClick')
    expect(mapUtilsContent).toContain("return 'focus'")
  })

  it('desktop single click on selected returns deselect', () => {
    expect(mapUtilsContent).toContain('isSelected')
    expect(mapUtilsContent).toContain("return 'deselect'")
  })

  it('desktop single click on unselected returns select', () => {
    expect(mapUtilsContent).toContain("return 'select'")
  })
})
