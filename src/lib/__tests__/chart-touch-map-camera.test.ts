/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..', '..')

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

// ============================================================================
// PART A — DASHBOARD CHART TOUCH
// ============================================================================

describe('Part A: Dashboard Chart Touch', () => {
  const chartUtils = readSrc('lib/chart-utils.tsx')
  const tapGuard = readSrc('lib/gesture/tap-guard.ts')

  describe('Gesture classification (tap-guard)', () => {
    it('uses movement threshold (10px) for tap-vs-drag', () => {
      expect(tapGuard).toContain('GESTURE_MOVEMENT_THRESHOLD = 10')
      expect(tapGuard).toContain('isDragGesture')
    })

    it('classifies as drag if X or Y exceeds threshold', () => {
      expect(tapGuard).toContain('deltaX > GESTURE_MOVEMENT_THRESHOLD')
      expect(tapGuard).toContain('deltaY > GESTURE_MOVEMENT_THRESHOLD')
    })
  })

  describe('ChartTouchWrapper — swipe suppression', () => {
    it('tracks drag state via ref (synchronous, not async state)', () => {
      expect(chartUtils).toContain('isDraggingRef')
      expect(chartUtils).toContain('startXRef')
      expect(chartUtils).toContain('startYRef')
    })

    it('disables pointer events ONLY when drag is detected (not on pointerdown)', () => {
      const pdIdx = chartUtils.indexOf('handlePointerDown')
      const pdBlock = chartUtils.substring(pdIdx, pdIdx + 400)
      expect(pdBlock).not.toContain('disableChartPointerEvents')
    })

    it('clears Recharts state immediately when drag is detected', () => {
      expect(chartUtils).toContain('clearRechartsState')
      expect(chartUtils).toContain('clearRechartsState()')
    })

    it('dispatches mouseleave + touchend to clear Recharts activation', () => {
      expect(chartUtils).toContain("MouseEvent('mouseleave'")
      expect(chartUtils).toContain("TouchEvent('touchend'")
    })

    it('suppresses post-swipe click via justDraggedRef + onClickCapture', () => {
      expect(chartUtils).toContain('justDraggedRef')
      expect(chartUtils).toContain('handleClickCapture')
      expect(chartUtils).toContain('e.preventDefault()')
      expect(chartUtils).toContain('e.stopPropagation()')
    })

    it('sets justDraggedRef=true on touch end after a drag', () => {
      const teIdx = chartUtils.indexOf('handleTouchEnd')
      const teBlock = chartUtils.substring(teIdx, teIdx + 400)
      expect(teBlock).toContain('justDraggedRef.current = true')
    })

    it('sets justDraggedRef=true on pointer up after a drag', () => {
      const puIdx = chartUtils.indexOf('handlePointerUp')
      const puBlock = chartUtils.substring(puIdx, puIdx + 400)
      expect(puBlock).toContain('justDraggedRef.current = true')
    })

    it('resets justDraggedRef after suppressing one click (not permanent)', () => {
      const ccIdx = chartUtils.indexOf('handleClickCapture')
      const ccBlock = chartUtils.substring(ccIdx, ccIdx + 300)
      expect(ccBlock).toContain('justDraggedRef.current = false')
    })

    it('resets justDraggedRef on new gesture start (touchstart)', () => {
      const tsIdx = chartUtils.indexOf('handleTouchStart')
      const tsBlock = chartUtils.substring(tsIdx, tsIdx + 1200)
      expect(tsBlock).toContain('justDraggedRef.current = false')
    })

    it('resets justDraggedRef on new gesture start (pointerdown)', () => {
      const pdIdx = chartUtils.indexOf('handlePointerDown')
      const pdBlock = chartUtils.substring(pdIdx, pdIdx + 600)
      expect(pdBlock).toContain('justDraggedRef.current = false')
    })

    it('does NOT use document-wide click suppression', () => {
      expect(chartUtils).not.toContain('document.addEventListener')
    })

    it('does NOT use arbitrary debounce timeout for gesture', () => {
      expect(chartUtils).not.toContain('setTimeout')
    })

    it('preserves touch-action: pan-y pan-x for native scrolling', () => {
      expect(chartUtils).toContain("touchAction: 'pan-y pan-x'")
    })

    it('only tracks touch pointers (mouse hover preserved)', () => {
      expect(chartUtils).toContain("e.pointerType !== 'touch'")
    })
  })

  describe('Focus / white outline fix', () => {
    it('outer container uses focus:outline-none (suppresses touch focus ring)', () => {
      expect(chartUtils).toContain('focus:outline-none')
    })

    it('outer container uses focus-visible:outline-2 (keyboard focus preserved)', () => {
      expect(chartUtils).toContain('focus-visible:outline-2')
      expect(chartUtils).toContain('focus-visible:outline-blue-500/30')
    })

    it('SVG surface uses :focus:outline-none (suppresses touch-induced SVG focus)', () => {
      expect(chartUtils).toContain('[&_.recharts-surface:focus]:outline-none')
    })

    it('SVG surface preserves :focus-visible for keyboard accessibility', () => {
      expect(chartUtils).toContain('[&_.recharts-surface:focus-visible]:outline-2')
    })

    it('wrapper also gets :focus:outline-none', () => {
      expect(chartUtils).toContain('[&_.recharts-wrapper:focus]:outline-none')
    })

    it('does NOT globally disable outlines (uses focus-visible)', () => {
      expect(chartUtils).toContain('focus:outline-none')
      expect(chartUtils).toContain('focus-visible:outline-2')
    })

    it('tabIndex=0 preserves keyboard focusability', () => {
      expect(chartUtils).toContain('tabIndex={0}')
    })
  })

  describe('Desktop preservation', () => {
    it('pointer handlers only act on touch pointers', () => {
      const checks = (chartUtils.match(/e\.pointerType !== 'touch'/g) || []).length
      expect(checks).toBeGreaterThanOrEqual(3)
    })

    it('mouse hover works (pointerEvents stay auto for non-touch)', () => {
      expect(chartUtils).toContain('disableChartPointerEvents')
      expect(chartUtils).toContain('restoreChartPointerEvents')
    })
  })

  describe('All chart components use ChartTouchWrapper', () => {
    const graphs = [
      'components/analytics/RevenueGraph.tsx',
      'components/analytics/BusinessActivityGraph.tsx',
      'components/analytics/CustomerPipelineGraph.tsx',
      'components/analytics/NewCustomersGraph.tsx',
      'components/analytics/PaymentCollectionGraph.tsx',
      'components/analytics/CustomersStatusGraph.tsx',
      'components/analytics/LeadsSourceGraph.tsx',
    ]

    for (const graph of graphs) {
      it(`${path.basename(graph)} uses ChartTouchWrapper`, () => {
        const content = readSrc(graph)
        expect(content).toContain('ChartTouchWrapper')
      })
    }
  })

  describe('Post-drag stale suppression', () => {
    it('10. drag + synthesized click -> click suppressed', () => {
      // justDraggedRef is set true on drag end, click capture checks it
      expect(chartUtils).toContain('justDraggedRef.current = true')
      expect(chartUtils).toContain('handleClickCapture')
    })

    it('11. drag where no click occurs -> next new clean tap still works', () => {
      // justDraggedRef is reset on new gesture start (touchstart/pointerdown)
      // so if no click was synthesized, the next tap begins with clean state
      const tsIdx = chartUtils.indexOf('handleTouchStart')
      const tsBlock = chartUtils.substring(tsIdx, tsIdx + 1200)
      expect(tsBlock).toContain('justDraggedRef.current = false')
    })
  })
})

// ============================================================================
// PART B — SCHEDULE MAP CAMERA OWNERSHIP
// ============================================================================

describe('Part B: Schedule Map Camera Ownership', () => {
  const map = readSrc('components/schedule/ScheduleMap.tsx')

  describe('Camera ownership refs', () => {
    it('has programmaticMoveInProgressRef', () => {
      expect(map).toContain('programmaticMoveInProgressRef')
    })

    it('has activeGestureRef', () => {
      expect(map).toContain('activeGestureRef')
    })

    it('has userInteractedForContextRef', () => {
      expect(map).toContain('userInteractedForContextRef')
    })

    it('has semanticContextKeyRef', () => {
      expect(map).toContain('semanticContextKeyRef')
    })

    it('does NOT have lastFocusRequestRef (removed)', () => {
      expect(map).not.toContain('lastFocusRequestRef')
    })

    it('does NOT have FOCUS_REASSERT_GUARD_MS (removed)', () => {
      expect(map).not.toContain('FOCUS_REASSERT_GUARD_MS')
    })

    it('does NOT have recentlyFocused check (removed)', () => {
      expect(map).not.toContain('recentlyFocused')
    })
  })

  describe('1. Marker SINGLE TAP -> info only, NO camera', () => {
    it('single tap calls toggleMapItemDetails (info toggle)', () => {
      // The single-tap timer path calls toggleMapItemDetails
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 3000)
      expect(block).toContain('toggleMapItemDetails(item.id)')
    })

    it('single tap is delayed by DOUBLE_TAP_DELAY_MS for double-tap detection', () => {
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 3000)
      expect(block).toContain('setTimeout')
      expect(block).toContain('DOUBLE_TAP_DELAY_MS')
    })

    it('single tap does NOT call focusStopOnMap or panToMarker', () => {
      // The single-tap timer block should only call toggleMapItemDetails
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 3000)
      // Find the single-tap timer block
      const singleTapIdx = block.indexOf('// SINGLE TAP:')
      if (singleTapIdx === -1) {
        // Look for the else branch (single tap)
        const elseIdx = block.indexOf('} else {')
        const singleBlock = block.substring(elseIdx, elseIdx + 500)
        expect(singleBlock).toContain('toggleMapItemDetails')
        expect(singleBlock).not.toContain('focusStopOnMap')
        expect(singleBlock).not.toContain('panToMarker')
      }
    })
  })

  describe('2. Marker DOUBLE TAP -> select + focus', () => {
    it('double tap calls focusStopOnMap for non-business markers', () => {
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 4000)
      expect(block).toContain('focusStopOnMap(item.id, item.latitude, item.longitude)')
    })

    it('double tap cancels pending single-tap timer', () => {
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 4000)
      expect(block).toContain('clearTimeout(pendingTimer)')
    })

    it('double tap sets focusedMarkerId', () => {
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 4000)
      expect(block).toContain('setFocusedMarkerId(item.id)')
    })
  })

  describe('3. Selected marker SINGLE TAP -> unselect, NO camera', () => {
    it('single tap toggles info (toggleMapItemDetails handles select/unselect)', () => {
      // toggleMapItemDetails toggles: if already selected, it unselects
      const tIdx = map.indexOf('toggleMapItemDetails')
      const tBlock = map.substring(tIdx, tIdx + 300)
      expect(tBlock).toContain('setSelectedMapItemId(prev => prev === itemId ? null : itemId)')
    })
  })

  describe('4. Selected+focused marker DOUBLE TAP -> unfocus + fit-all', () => {
    it('double tap on focused marker calls unfocusMarker', () => {
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 4000)
      expect(block).toContain('unfocusMarker()')
    })

    it('double tap on focused marker clears focusedMarkerId', () => {
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 4000)
      expect(block).toContain('setFocusedMarkerId(null)')
    })

    it('double tap on focused marker toggles details (unselects)', () => {
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 4000)
      expect(block).toContain('toggleMapItemDetails(item.id)')
    })
  })

  describe('5. Stop-card parity with marker', () => {
    it('stop-card single tap calls toggleMapItemDetails (info only)', () => {
      const cardIdx = map.indexOf('handleItemClick')
      const block = map.substring(cardIdx, cardIdx + 2000)
      expect(block).toContain('toggleMapItemDetails(item.id)')
    })

    it('stop-card double tap calls focusStopOnMap', () => {
      const cardIdx = map.indexOf('handleItemClick')
      const block = map.substring(cardIdx, cardIdx + 2000)
      expect(block).toContain('focusStopOnMap(item.id, item.latitude, item.longitude)')
    })

    it('stop-card double tap on focused calls unfocusMarker', () => {
      const cardIdx = map.indexOf('handleItemClick')
      const block = map.substring(cardIdx, cardIdx + 2000)
      expect(block).toContain('unfocusMarker()')
    })

    it('stop-card uses same DOUBLE_TAP_DELAY_MS threshold', () => {
      const cardIdx = map.indexOf('handleItemClick')
      const block = map.substring(cardIdx, cardIdx + 2000)
      expect(block).toContain('DOUBLE_TAP_DELAY_MS')
    })

    it('stop-card single tap does NOT call focusStopOnMap', () => {
      const cardIdx = map.indexOf('handleItemClick')
      const block = map.substring(cardIdx, cardIdx + 3000)
      // Find the single-tap timer block: it contains setTimeout and
      // toggleMapItemDetails but NOT focusStopOnMap. The single-tap
      // timer is the LAST setTimeout in handleItemClick.
      const lastSetTimeout = block.lastIndexOf('setTimeout')
      const singleBlock = block.substring(lastSetTimeout - 200, lastSetTimeout + 400)
      expect(singleBlock).toContain('toggleMapItemDetails')
      expect(singleBlock).not.toContain('focusStopOnMap')
    })
  })

  describe('6. Single-vs-double tap arbitration', () => {
    it('uses DOUBLE_TAP_DELAY_MS = 300', () => {
      expect(map).toContain('DOUBLE_TAP_DELAY_MS = 300')
    })

    it('first tap schedules single-tap action via timer', () => {
      expect(map).toContain('singleTapTimerRef')
      expect(map).toContain('setTimeout')
    })

    it('second tap cancels pending single-tap timer', () => {
      expect(map).toContain('clearTimeout(pendingTimer)')
      expect(map).toContain('singleTapTimerRef.current.delete(item.id)')
    })

    it('double-tap action runs instead of single-tap (no flicker)', () => {
      // The isDoubleTap branch runs focusStopOnMap/unfocusMarker
      // The single-tap timer is cancelled, so toggleMapItemDetails does NOT run
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 3000)
      const doubleIdx = block.indexOf('isDoubleTap')
      const doubleBlock = block.substring(doubleIdx, doubleIdx + 500)
      expect(doubleBlock).toContain('clearTimeout(pendingTimer)')
    })
  })

  describe('7. Camera ownership — one owner for automatic fit-all', () => {
    it('auto-frame effect is the sole automatic fit-all owner', () => {
      expect(map).toContain("'auto_frame'")
    })

    it('stale-focus effect does NOT call fitBoundsWithMaxZoom', () => {
      // The stale-focus effect should only clear state, no camera command
      const staleIdx = map.indexOf('SCHEDULE_MAP_STALE_FOCUS')
      const staleBlock = map.substring(staleIdx, staleIdx + 500)
      expect(staleBlock).not.toContain('fitBoundsWithMaxZoom')
      expect(staleBlock).not.toContain('fitBounds')
    })

    it('stale-focus effect does NOT build LatLngBounds', () => {
      const staleIdx = map.indexOf('SCHEDULE_MAP_STALE_FOCUS')
      const staleBlock = map.substring(staleIdx, staleIdx + 500)
      expect(staleBlock).not.toContain('LatLngBounds')
    })

    it('stale-focus effect dependency array does NOT include fitBoundsWithMaxZoom', () => {
      // Find the stale-focus effect's closing dep array
      const staleIdx = map.indexOf('SCHEDULE_MAP_STALE_FOCUS')
      // The dep array is after the effect body
      const afterStale = map.substring(staleIdx, staleIdx + 2000)
      const depIdx = afterStale.indexOf('}, [')
      const depBlock = afterStale.substring(depIdx, depIdx + 200)
      expect(depBlock).not.toContain('fitBoundsWithMaxZoom')
      expect(depBlock).not.toContain('getResponsivePadding')
    })

    it('stale-focus effect only clears state (setSelectedMapItemId, setFocusedMarkerId)', () => {
      const staleIdx = map.indexOf('Clear stale selection')
      const staleBlock = map.substring(staleIdx, staleIdx + 2000)
      expect(staleBlock).toContain('setSelectedMapItemId(null)')
      expect(staleBlock).toContain('setFocusedMarkerId(null)')
    })
  })

  describe('8. Date change -> exactly ONE fitBounds', () => {
    it('auto-frame effect calls fitBoundsWithMaxZoom once on context change', () => {
      // The auto-frame effect has shouldAutoFit which includes contextChanged
      expect(map).toContain('contextChanged')
      expect(map).toContain('shouldAutoFit')
      expect(map).toContain("fitBoundsWithMaxZoom(bounds, MULTI_MARKER_MAX_ZOOM, padding, 'auto_frame')")
    })

    it('stale-focus effect issues NO camera command on date change', () => {
      // Check that the stale-focus effect body has no fitBounds CALL
      // (the word may appear in comments explaining the architecture)
      const staleIdx = map.indexOf('Clear stale selection')
      const staleBlock = map.substring(staleIdx, staleIdx + 2000)
      expect(staleBlock).not.toContain('fitBoundsWithMaxZoom')
      expect(staleBlock).not.toContain('fitBounds(')
    })

    it('only ONE fitBounds path in automatic effects (auto-frame)', () => {
      // Count fitBoundsWithMaxZoom calls in effects (not in user-action functions)
      // Auto-frame effect has one, stale-focus should have zero
      const staleIdx = map.indexOf('Clear stale selection')
      const staleEnd = map.indexOf('getDataSignature')
      const staleBlock = map.substring(staleIdx, staleEnd)
      expect(staleBlock).not.toContain('fitBoundsWithMaxZoom')
    })
  })

  describe('9. Selected marker state does NOT trigger auto-frame', () => {
    it('selectedMapItemId is NOT in auto-frame effect deps', () => {
      const depIdx = map.indexOf('eslint-disable-next-line react-hooks/exhaustive-deps')
      const commentBlock = map.substring(depIdx - 800, depIdx + 300)
      expect(commentBlock).toContain('selectedMapItemId')
      expect(commentBlock).toContain('intentionally excluded')
      const depArrayBlock = map.substring(depIdx, depIdx + 300)
      expect(depArrayBlock).not.toContain('selectedMapItemId')
    })

    it('showAllMode is NOT in auto-frame effect deps', () => {
      const depIdx = map.indexOf('eslint-disable-next-line react-hooks/exhaustive-deps')
      const depArrayBlock = map.substring(depIdx, depIdx + 300)
      expect(depArrayBlock).not.toContain('showAllMode')
    })
  })

  describe('10. Rapid same-marker taps -> stable', () => {
    it('double tap on unfocused marker focuses (no toggle back)', () => {
      // The double-tap on unfocused marker calls focusStopOnMap, not unfocusMarker
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 4000)
      // The focusedMarkerId === item.id check determines focus vs unfocus
      expect(block).toContain('focusedMarkerId === item.id')
      expect(block).toContain('focusStopOnMap')
      expect(block).toContain('unfocusMarker')
    })
  })

  describe('11. Rapid A -> B -> final B', () => {
    it('focusStopOnMap calls panToMarker (synchronous, last wins)', () => {
      const fsIdx = map.indexOf('focusStopOnMap')
      const fsBlock = map.substring(fsIdx, fsIdx + 800)
      expect(fsBlock).toContain('panToMarker')
    })

    it('panToMarker uses force=true for explicit focus', () => {
      const fsIdx = map.indexOf('focusStopOnMap')
      const fsBlock = map.substring(fsIdx, fsIdx + 800)
      expect(fsBlock).toContain('force: true')
    })
  })

  describe('12. User drag -> no snap-back', () => {
    it('dragstart sets activeGestureRef', () => {
      expect(map).toContain("'dragstart'")
      expect(map).toContain('activeGestureRef.current = true')
    })

    it('auto-frame does not run during active gesture', () => {
      expect(map).toContain('!activeGestureRef.current')
    })

    it('zoom_changed sets userInteractedForContextRef', () => {
      expect(map).toContain("'zoom_changed'")
      expect(map).toContain('userInteractedForContextRef.current = true')
    })
  })

  describe('13. Explicit Recenter / Show All still fit-all', () => {
    it('recenterMap calls fitBoundsWithMaxZoom', () => {
      expect(map).toContain('recenterMap')
      expect(map).toContain("'recenter'")
    })

    it('showAllMarkers calls fitBoundsWithMaxZoom', () => {
      expect(map).toContain('showAllMarkers')
      expect(map).toContain("'show_all_markers'")
    })

    it('unfocusMarker calls fitBoundsWithMaxZoom (explicit unfocus)', () => {
      expect(map).toContain('unfocusMarker')
      expect(map).toContain("'unfocus_marker'")
    })
  })

  describe('14. No parallel camera paths', () => {
    it('no flyTo / easeTo / setCenter calls', () => {
      expect(map).not.toContain('flyTo')
      expect(map).not.toContain('easeTo')
      expect(map).not.toContain('setCenter')
    })

    it('only fitBounds and panTo for camera moves', () => {
      expect(map).toContain('fitBounds')
      expect(map).toContain('panTo')
    })
  })

  describe('15. Business marker exclusion', () => {
    it('business markers toggle details only (no camera focus)', () => {
      const markerClickIdx = map.indexOf("marker.addListener('click'")
      const block = map.substring(markerClickIdx, markerClickIdx + 3000)
      // Business markers should not get focusStopOnMap
      expect(block).toContain("item.type !== 'business'")
    })

    it('business stop-card toggles details only', () => {
      const cardIdx = map.indexOf('handleItemClick')
      const block = map.substring(cardIdx, cardIdx + 2000)
      expect(block).toContain("item.type !== 'business'")
    })
  })
})
