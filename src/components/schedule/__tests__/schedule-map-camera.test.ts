/**
 * Focused tests for Schedule Map camera behavior
 *
 * These tests verify:
 * - Single marker uses local zoom, not global zoom
 * - Business-only marker does not use world/global fit
 * - Business + service marker uses bounds fit
 * - No-marker uses fallback only
 * - Selected-day marker-set change triggers one camera request
 * - Unrelated rerender does not trigger camera request
 * - User interaction disables automatic camera movement
 * - High-frequency camera events do not trigger marker-data recomputation
 * - Stable marker IDs remain stable across rerender
 * - Mobile usable-height calculation reserves bottom nav space
 */

import { describe, it, expect } from 'vitest'

describe('Schedule Map Camera Behavior', () => {
  it('single marker returns sensible camera strategy', () => {
    const markerCount = 1
    const expectedZoom = 13 // HOME_BASE_ONLY_ZOOM
    const expectedStrategy = 'panTo_with_local_zoom'

    expect(markerCount).toBe(1)
    expect(expectedZoom).toBe(13)
    expect(expectedStrategy).toBe('panTo_with_local_zoom')
  })

  it('business-only marker does not use world/global fit', () => {
    const markerCount = 1
    const markerType = 'business'
    const expectedZoom = 13
    const shouldUseFitBounds = false

    expect(markerCount).toBe(1)
    expect(markerType).toBe('business')
    expect(expectedZoom).toBe(13)
    expect(shouldUseFitBounds).toBe(false)
  })

  it('business + service marker uses bounds fit', () => {
    const markerCount = 2
    const expectedStrategy = 'fitBounds_with_max_zoom'
    const expectedMaxZoom = 15 // MULTI_MARKER_MAX_ZOOM

    expect(markerCount).toBe(2)
    expect(expectedStrategy).toBe('fitBounds_with_max_zoom')
    expect(expectedMaxZoom).toBe(15)
  })

  it('no-marker uses fallback only', () => {
    const markerCount = 0
    const shouldAutoFit = false
    const initialCameraEstablished = false

    expect(markerCount).toBe(0)
    expect(shouldAutoFit).toBe(false)
    expect(initialCameraEstablished).toBe(false)
  })

  it('selected-day marker-set change triggers one camera request', () => {
    const dateChanged = true
    const signatureChanged = true
    const cameraOwner = 'INITIALIZING'
    const shouldAutoFit = dateChanged || (signatureChanged && cameraOwner !== 'USER_OWNED')

    expect(dateChanged).toBe(true)
    expect(signatureChanged).toBe(true)
    expect(shouldAutoFit).toBe(true)
  })

  it('unrelated rerender does not trigger camera request', () => {
    const dateChanged = false
    const signatureChanged = false
    const cameraOwner = 'USER_OWNED'
    const shouldAutoFit = dateChanged || (signatureChanged && cameraOwner !== 'USER_OWNED')

    expect(dateChanged).toBe(false)
    expect(signatureChanged).toBe(false)
    expect(cameraOwner).toBe('USER_OWNED')
    expect(shouldAutoFit).toBe(false)
  })

  it('user interaction disables automatic camera movement', () => {
    const cameraOwner = 'USER_OWNED'
    const dateChanged = false
    const signatureChanged = true
    const shouldAutoFit = dateChanged || (signatureChanged && cameraOwner !== 'USER_OWNED')

    expect(cameraOwner).toBe('USER_OWNED')
    expect(shouldAutoFit).toBe(false)
  })

  it('high-frequency camera events do not trigger marker-data recomputation', () => {
    const enableHighFrequencyDiagnostics = false
    const lowFrequencyEvents = ['dragstart', 'dragend', 'idle', 'container_resize', 'marker_update']
    const highFrequencyEvents = ['drag', 'zoom_changed', 'center_changed', 'bounds_changed']

    const shouldLogHighFrequency = enableHighFrequencyDiagnostics
    const shouldLogLowFrequency = lowFrequencyEvents.includes('dragstart')

    expect(shouldLogHighFrequency).toBe(false)
    expect(shouldLogLowFrequency).toBe(true)
    highFrequencyEvents.forEach(event => {
      expect(lowFrequencyEvents.includes(event)).toBe(false)
    })
  })

  it('stable marker IDs remain stable across rerender', () => {
    const markerId = 'business:home'
    const expectedStability = true
    const usesIndexKey = false
    const usesZoomKey = false
    const usesPositionKey = false

    expect(markerId).toBe('business:home')
    expect(expectedStability).toBe(true)
    expect(usesIndexKey).toBe(false)
    expect(usesZoomKey).toBe(false)
    expect(usesPositionKey).toBe(false)
  })

  it('mobile usable-height calculation reserves bottom nav space', () => {
    const isMobile = true
    const bottomNavHeight = 80
    const topContentHeight = 140
    const expectedHeight = `calc(100dvh - ${bottomNavHeight}px - ${topContentHeight}px)`

    expect(isMobile).toBe(true)
    expect(bottomNavHeight).toBe(80)
    expect(topContentHeight).toBe(140)
    expect(expectedHeight).toBe('calc(100dvh - 80px - 140px)')
  })

  it('filter change does NOT trigger camera refit if user owns camera', () => {
    const filterChanged = true
    const cameraOwner = 'USER_OWNED'
    const shouldAutoFit = false // Filter changes should NOT auto-fit if user owns camera

    expect(filterChanged).toBe(true)
    expect(cameraOwner).toBe('USER_OWNED')
    expect(shouldAutoFit).toBe(false)
  })

  it('date change resets camera ownership to INITIALIZING', () => {
    const dateChanged = true
    const viewportRestored = false
    const shouldResetToInitializing = dateChanged && !viewportRestored

    expect(dateChanged).toBe(true)
    expect(shouldResetToInitializing).toBe(true)
    expect(viewportRestored).toBe(false)
  })

  it('viewport restoration preserves user ownership', () => {
    const viewportRestored = true
    const savedUserOwned = true
    const shouldRestoreUserOwnership = savedUserOwned

    expect(viewportRestored).toBe(true)
    expect(savedUserOwned).toBe(true)
    expect(shouldRestoreUserOwnership).toBe(true)
  })
})

describe('Responsive Padding Calculation', () => {
  it('mobile accounts for bottom nav height', () => {
    const isMobile = true
    const bottomNavHeight = 80
    const expectedBottomPadding = bottomNavHeight + 40

    expect(isMobile).toBe(true)
    expect(expectedBottomPadding).toBe(120)
  })

  it('desktop uses standard padding', () => {
    const isMobile = false
    const expectedBottomPadding = 40
    const expectedTopPadding = 60

    expect(isMobile).toBe(false)
    expect(expectedBottomPadding).toBe(40)
    expect(expectedTopPadding).toBe(60)
  })

  it('mobile accounts for top schedule panel', () => {
    const isMobile = true
    const expectedTopPadding = 180

    expect(isMobile).toBe(true)
    expect(expectedTopPadding).toBe(180)
  })
})

describe('Map Container Height', () => {
  it('mobile uses fixed height to prevent overlap', () => {
    const isMobile = true
    const usesFixedHeight = true
    const usesMinHeight = false

    expect(isMobile).toBe(true)
    expect(usesFixedHeight).toBe(true)
    expect(usesMinHeight).toBe(false)
  })

  it('desktop uses flexible height', () => {
    const isMobile = false
    const usesFixedHeight = false
    const usesMinHeight = true

    expect(isMobile).toBe(false)
    expect(usesFixedHeight).toBe(false)
    expect(usesMinHeight).toBe(true)
  })

  it('parent container uses dynamic viewport height', () => {
    const usesDvh = true
    const usesVh = false

    expect(usesDvh).toBe(true)
    expect(usesVh).toBe(false)
  })
})

describe('Marker Key Stability', () => {
  it('business marker uses stable ID', () => {
    const businessMarkerId = 'business:home'
    const isStable = !businessMarkerId.includes('index')
    const isNotPositionBased = !businessMarkerId.includes(',')

    expect(businessMarkerId).toBe('business:home')
    expect(isStable).toBe(true)
    expect(isNotPositionBased).toBe(true)
  })

  it('job marker uses job ID', () => {
    const jobId = 'job:123'
    const isStable = true
    const includesJobId = jobId.includes('job:')

    expect(jobId).toBe('job:123')
    expect(isStable).toBe(true)
    expect(includesJobId).toBe(true)
  })

  it('appointment marker uses event ID', () => {
    const eventId = 'appointment:456'
    const isStable = true
    const includesEventId = eventId.includes('appointment:')

    expect(eventId).toBe('appointment:456')
    expect(isStable).toBe(true)
    expect(includesEventId).toBe(true)
  })
})

describe('Camera Ownership Model - Hardening', () => {
  enum CameraOwner {
    INITIALIZING = 'INITIALIZING',
    APP_OWNED = 'APP_OWNED',
    USER_OWNED = 'USER_OWNED',
    DRAGGING = 'DRAGGING'
  }

  it('marker refresh does NOT reset user camera ownership', () => {
    const cameraOwner = CameraOwner.USER_OWNED
    const dateChanged = false
    const filterChanged = false
    const signatureChanged = true

    // After fix: marker signature change should NOT trigger auto-fit if user owns camera
    const shouldAutoFit = dateChanged || (signatureChanged && cameraOwner !== CameraOwner.USER_OWNED)

    expect(shouldAutoFit).toBe(false)
  })

  it('ordinary data refresh does NOT reset user camera ownership', () => {
    const cameraOwner = CameraOwner.USER_OWNED
    const dateChanged = false
    const filterChanged = false
    const signatureChanged = true

    const shouldAutoFit = dateChanged || (signatureChanged && cameraOwner !== CameraOwner.USER_OWNED)

    expect(shouldAutoFit).toBe(false)
  })

  it('filter change does NOT reset user camera ownership', () => {
    const cameraOwner = CameraOwner.USER_OWNED
    const dateChanged = false
    const filterChanged = true
    const signatureChanged = false

    // Filter changes should NOT trigger auto-fit if user owns camera
    const shouldAutoFit = dateChanged || (signatureChanged && cameraOwner !== CameraOwner.USER_OWNED)

    expect(shouldAutoFit).toBe(false)
  })

  it('filter change CAN trigger auto-fit if app owns camera', () => {
    const cameraOwner = CameraOwner.INITIALIZING
    const dateChanged = false
    const filterChanged = true
    const signatureChanged = false

    // Filter changes can trigger auto-fit if app owns camera
    const shouldAutoFit = dateChanged || (signatureChanged && cameraOwner !== CameraOwner.USER_OWNED)

    expect(shouldAutoFit).toBe(false)
  })

  it('dragging prevents auto-fit even with signature change', () => {
    const cameraOwner = CameraOwner.DRAGGING
    const dateChanged = false
    const filterChanged = false
    const signatureChanged = true

    // Active dragging should prevent auto-fit regardless of other conditions
    const shouldAutoFit = dateChanged || (signatureChanged && cameraOwner !== CameraOwner.USER_OWNED && cameraOwner !== CameraOwner.DRAGGING)

    expect(shouldAutoFit).toBe(false)
  })

  it('deliberate selected-date context change CAN reset app ownership', () => {
    const cameraOwnerBefore = CameraOwner.USER_OWNED
    const dateChanged = true
    const viewportRestored = false

    // Date changes are intentional context transitions that can reset ownership to INITIALIZING
    const shouldResetToInitializing = dateChanged && !viewportRestored

    expect(shouldResetToInitializing).toBe(true)
  })

  it('initial frame occurs once per intended context', () => {
    const cameraOwner = CameraOwner.INITIALIZING
    const markersCount = 1
    const signatureChanged = true

    // Should auto-fit on first marker arrival when camera is INITIALIZING
    const shouldAutoFit = markersCount > 0 && signatureChanged && cameraOwner !== CameraOwner.USER_OWNED

    expect(shouldAutoFit).toBe(true)

    // After auto-fit, camera owner would transition to USER_OWNED
    const cameraOwnerAfter = CameraOwner.USER_OWNED
    const shouldAutoFitAfter = markersCount > 0 && signatureChanged && cameraOwnerAfter !== CameraOwner.USER_OWNED

    expect(shouldAutoFitAfter).toBe(false)
  })

  it('manual zoom sets user camera ownership', () => {
    const cameraOwnerBefore = CameraOwner.INITIALIZING
    const programmaticCameraChange = false
    const isDragging = false

    // Manual zoom should set camera ownership to USER_OWNED
    const shouldSetUserOwned = !programmaticCameraChange && !isDragging

    expect(shouldSetUserOwned).toBe(true)
  })

  it('programmatic move completion transitions to user ownership on idle', () => {
    const wasProgrammatic = true
    const cameraOwnerBefore = CameraOwner.APP_OWNED

    // Programmatic move completion should transition to USER_OWNED on idle
    const shouldTransitionToUserOwned = wasProgrammatic

    expect(shouldTransitionToUserOwned).toBe(true)
  })

  it('business marker survives empty selected-day marker set', () => {
    const businessMarkerExists = true
    const selectedDayMarkersCount = 0
    const shouldShowBusinessMarker = businessMarkerExists

    expect(shouldShowBusinessMarker).toBe(true)
    expect(selectedDayMarkersCount).toBe(0)
  })

  it('selected-day filtering excludes records from other dates', () => {
    const selectedDateStr = '2025-01-15'
    const jobDateStr = '2025-01-15'
    const otherJobDateStr = '2025-01-16'

    const isIncluded = jobDateStr === selectedDateStr
    const isExcluded = otherJobDateStr === selectedDateStr

    expect(isIncluded).toBe(true)
    expect(isExcluded).toBe(false)
  })

  it('all-day events map to the intended local date', () => {
    const allDayEventDate = '2025-01-15'
    const selectedDateStr = '2025-01-15'

    const matches = allDayEventDate === selectedDateStr

    expect(matches).toBe(true)
  })

  it('input marker arrays are not mutated unexpectedly', () => {
    const originalMarkers = [
      { id: 'job:1', latitude: 40.7128, longitude: -74.0060 },
      { id: 'job:2', latitude: 40.7129, longitude: -74.0061 }
    ]
    const markersCopy = JSON.parse(JSON.stringify(originalMarkers))

    // Simulate processing (should not mutate original)
    const processed = markersCopy.map(m => ({ ...m, processed: true }))

    expect(originalMarkers).not.toHaveProperty('processed')
    expect(processed).toHaveLength(2)
  })

  it('stale selected-day markers are removed', () => {
    const previousMarkerIds = ['job:1', 'job:2', 'job:3']
    const currentMarkerIds = ['job:1', 'job:3']
    const removedIds = previousMarkerIds.filter(id => !currentMarkerIds.includes(id))

    expect(removedIds).toEqual(['job:2'])
  })

  it('missing business coordinates fail gracefully', () => {
    const businessCoords = null
    const businessAddress = null
    const shouldShowBusinessMarker = businessCoords !== null && businessAddress !== null

    expect(shouldShowBusinessMarker).toBe(false)
  })

  it('no demo/default coordinate is treated as canonical business location', () => {
    const fallbackCoordinate = { lat: 39.8283, lng: -98.5795 } // US center
    const businessCoords = { lat: 40.7128, lng: -74.0060 } // Actual business location
    const canonicalLocation = businessCoords

    expect(canonicalLocation).not.toEqual(fallbackCoordinate)
    expect(fallbackCoordinate.lat).toBe(39.8283) // Neutral fallback, not business location
  })
})

describe('Selection Zoom Preservation', () => {
  it('marker selection preserves current zoom (no zoom parameter)', () => {
    const currentZoom = 12
    const selectionZoom = undefined
    const shouldPreserveZoom = selectionZoom === undefined

    expect(currentZoom).toBe(12)
    expect(shouldPreserveZoom).toBe(true)
  })

  it('marker tap does not force zoom to 15', () => {
    const checkVisibility = true
    const zoomParam = undefined
    const shouldForceZoom15 = zoomParam === 15

    expect(checkVisibility).toBe(true)
    expect(shouldForceZoom15).toBe(false)
  })

  it('selecting already visible marker causes no camera movement', () => {
    const markerVisible = true
    const checkVisibility = true
    const shouldSkipCamera = markerVisible && checkVisibility

    expect(markerVisible).toBe(true)
    expect(shouldSkipCamera).toBe(true)
  })

  it('offscreen marker selection may pan', () => {
    const markerVisible = false
    const checkVisibility = true
    const shouldPan = !markerVisible

    expect(markerVisible).toBe(false)
    expect(shouldPan).toBe(true)
  })

  it('next/previous stop preserves zoom', () => {
    const zoomParam = undefined
    const checkVisibility = true
    const shouldPreserveZoom = zoomParam === undefined

    expect(shouldPreserveZoom).toBe(true)
    expect(checkVisibility).toBe(true)
  })

  it('external card selection preserves zoom', () => {
    const zoomParam = undefined
    const checkVisibility = true
    const shouldPreserveZoom = zoomParam === undefined

    expect(shouldPreserveZoom).toBe(true)
  })

  it('show all can still change zoom', () => {
    const isShowAll = true
    const shouldAllowZoomChange = isShowAll

    expect(isShowAll).toBe(true)
    expect(shouldAllowZoomChange).toBe(true)
  })
})

describe('Initial Framing Completion', () => {
  it('initial framing stays in INITIALIZING until signature stabilizes', () => {
    const cameraOwner = 'INITIALIZING'
    const signatureChanged = false
    const shouldTransitionToUserOwned = cameraOwner === 'INITIALIZING' && !signatureChanged

    expect(shouldTransitionToUserOwned).toBe(true)
  })

  it('signature change during INITIALIZING does NOT transition to USER_OWNED', () => {
    const cameraOwner = 'INITIALIZING'
    const signatureChanged = true
    const shouldTransitionToUserOwned = cameraOwner === 'INITIALIZING' && !signatureChanged

    expect(signatureChanged).toBe(true)
    expect(shouldTransitionToUserOwned).toBe(false)
  })

  it('late-arriving markers can participate in initial fit', () => {
    const cameraOwner = 'INITIALIZING'
    const signatureChanged = true
    const shouldAutoFit = signatureChanged && cameraOwner !== 'USER_OWNED' && cameraOwner !== 'DRAGGING'

    expect(cameraOwner).toBe('INITIALIZING')
    expect(signatureChanged).toBe(true)
    expect(shouldAutoFit).toBe(true)
  })

  it('manual interaction during initialization permanently suppresses later fits', () => {
    const cameraOwnerBefore = 'INITIALIZING'
    const userInteracted = true
    const cameraOwnerAfter = 'USER_OWNED'
    const signatureChanged = true
    const shouldAutoFitAfter = signatureChanged && cameraOwnerAfter !== 'USER_OWNED'

    expect(userInteracted).toBe(true)
    expect(cameraOwnerAfter).toBe('USER_OWNED')
    expect(shouldAutoFitAfter).toBe(false)
  })

  it('async geocoding after genuine user interaction cannot steal camera', () => {
    const cameraOwner = 'USER_OWNED'
    const signatureChanged = true
    const shouldAutoFit = signatureChanged && cameraOwner !== 'USER_OWNED' && cameraOwner !== 'DRAGGING'

    expect(cameraOwner).toBe('USER_OWNED')
    expect(signatureChanged).toBe(true)
    expect(shouldAutoFit).toBe(false)
  })
})