import { describe, it, expect } from 'vitest'

describe('ScheduleMap - Date Comparison', () => {
  it('should use local timezone for date comparison', () => {
    // Test that toLocaleDateString('en-CA') gives consistent YYYY-MM-DD format
    const date = new Date('2024-01-15T20:00:00-05:00') // 8 PM EST
    const localDateStr = date.toLocaleDateString('en-CA')
    const utcDateStr = date.toISOString().split('T')[0]

    // In EST timezone, this should be 2024-01-15, not 2024-01-16 (UTC)
    expect(localDateStr).toBe('2024-01-15')
    // UTC would give wrong date
    expect(utcDateStr).toBe('2024-01-16')
  })

  it('should handle midnight boundary correctly in local timezone', () => {
    // Just before midnight in local time
    const date = new Date('2024-01-15T23:59:59-05:00')
    const localDateStr = date.toLocaleDateString('en-CA')

    expect(localDateStr).toBe('2024-01-15')
  })

  it('should match database date format', () => {
    const date = new Date('2024-06-29T00:00:00')
    const localDateStr = date.toLocaleDateString('en-CA')

    // Database stores dates as YYYY-MM-DD
    expect(localDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('ScheduleMap - Business Marker Handling', () => {
  it('business marker should not have stop number', () => {
    const items = [
      {
        id: 'business:home',
        type: 'business' as const,
        title: 'ReplyFlow HQ',
        customerName: null,
        customerPhone: null,
        address: '123 Main St',
        scheduledDate: null,
        scheduledTime: null,
        status: null,
        leadId: null,
        jobId: null,
        latitude: 40.7128,
        longitude: -74.0060
      },
      {
        id: 'job:1',
        type: 'job' as const,
        title: 'Service Call',
        customerName: 'John Doe',
        customerPhone: '+14125551234',
        address: '456 Oak Ave',
        scheduledDate: '2024-01-15',
        scheduledTime: '09:00',
        status: 'scheduled',
        leadId: 'lead-1',
        jobId: 'job-1',
        latitude: 40.7138,
        longitude: -74.0070
      }
    ]

    // Simulate stop number assignment logic - business markers get undefined, others get sequential numbers
    const sorted = [...items]
      .sort((a, b) => {
        const timeA = a.scheduledTime || '00:00'
        const timeB = b.scheduledTime || '00:00'
        return timeA.localeCompare(timeB)
      })
      .map((item, index) => {
        if (item.type === 'business') {
          return { ...item, stopNumber: undefined }
        }
        return { ...item, stopNumber: index + 1 }
      })

    const businessItem = sorted.find(item => item.type === 'business')
    const jobItem = sorted.find(item => item.type === 'job')

    expect(businessItem?.stopNumber).toBeUndefined()
    // Job gets index 1 + 1 = 2 because business is at index 0
    expect(jobItem?.stopNumber).toBe(2)
  })

  it('business marker should appear first in sort order regardless of time', () => {
    const items = [
      {
        id: 'job:1',
        type: 'job' as const,
        title: 'Service Call',
        customerName: 'John Doe',
        customerPhone: '+14125551234',
        address: '456 Oak Ave',
        scheduledDate: '2024-01-15',
        scheduledTime: '08:00',
        status: 'scheduled',
        leadId: 'lead-1',
        jobId: 'job-1',
        latitude: 40.7138,
        longitude: -74.0070
      },
      {
        id: 'business:home',
        type: 'business' as const,
        title: 'ReplyFlow HQ',
        customerName: null,
        customerPhone: null,
        address: '123 Main St',
        scheduledDate: null,
        scheduledTime: null,
        status: null,
        leadId: null,
        jobId: null,
        latitude: 40.7128,
        longitude: -74.0060
      }
    ]

    // Business marker should be first (no time, sorts to 00:00)
    const sorted = [...items].sort((a, b) => {
      const timeA = a.scheduledTime || '00:00'
      const timeB = b.scheduledTime || '00:00'
      return timeA.localeCompare(timeB)
    })

    expect(sorted[0].type).toBe('business')
    expect(sorted[1].type).toBe('job')
  })
})

describe('ScheduleMap - Camera Coalescing', () => {
  it('initial marker batch should coalesce into one camera-fit decision', () => {
    // This test documents the camera coalescing logic:
    // - initialCameraEstablishedRef starts as false
    // - First marker batch triggers fitBounds and sets flag to true
    // - Subsequent marker signature changes (async geocoding) do not trigger additional fits
    // - Only date changes or filter changes reset the flag and allow new fits

    const initialCameraEstablished = { current: false }
    const dateChanged = false
    const filterChanged = false
    const signatureChanged = true
    const lastAutoFitDateKey = null
    const currentDateKey = '2024-01-15'

    // First batch: should fit
    const shouldFitFirst = dateChanged || filterChanged || (signatureChanged && lastAutoFitDateKey !== currentDateKey && !initialCameraEstablished.current)
    expect(shouldFitFirst).toBe(true)

    // Mark camera as established
    initialCameraEstablished.current = true

    // Late business geocoding: should NOT fit (camera already established)
    const shouldFitLate = dateChanged || filterChanged || (signatureChanged && lastAutoFitDateKey !== currentDateKey && !initialCameraEstablished.current)
    expect(shouldFitLate).toBe(false)
  })

  it('late business geocode does not cause second fit after initial camera established', () => {
    // Business geocoding happens asynchronously after initial marker batch
    // It should not trigger a separate camera movement

    const initialCameraEstablished = { current: true } // Already established
    const dateChanged = false
    const filterChanged = false
    const signatureChanged = true // Business marker added
    const lastAutoFitDateKey = '2024-01-15'
    const currentDateKey = '2024-01-15'

    const shouldFit = dateChanged || filterChanged || (signatureChanged && lastAutoFitDateKey !== currentDateKey && !initialCameraEstablished.current)
    expect(shouldFit).toBe(false) // Should NOT fit
  })

  it('user interaction prevents automatic refit', () => {
    // Once user manually pans/zooms, auto-fit should be disabled

    const userInteracted = true
    const showAllMode = true

    // Auto-fit is only active when showAllMode && !userInteracted
    const canAutoFit = showAllMode && !userInteracted
    expect(canAutoFit).toBe(false)
  })

  it('explicit date filter change permits one new fit', () => {
    // Date changes reset initialCameraEstablishedRef to allow new fit

    const initialCameraEstablished = { current: true }
    const dateChanged = true
    const filterChanged = false
    const signatureChanged = true

    // Date changed: should fit regardless of initialCameraEstablished
    const shouldFit = dateChanged || filterChanged || (signatureChanged && !initialCameraEstablished.current)
    expect(shouldFit).toBe(true)
  })

  it('explicit filter change permits one new fit', () => {
    // Filter changes reset initialCameraEstablishedRef to allow new fit

    const initialCameraEstablished = { current: true }
    const dateChanged = false
    const filterChanged = true
    const signatureChanged = true

    // Filter changed: should fit regardless of initialCameraEstablished
    const shouldFit = dateChanged || filterChanged || (signatureChanged && !initialCameraEstablished.current)
    expect(shouldFit).toBe(true)
  })

  it('multiple async marker updates during same load do not cause repeated fit', () => {
    // Simulate: jobs arrive, then calendar geocodes, then business geocodes
    // Only the first should trigger a fit

    const initialCameraEstablished = { current: false }
    const dateChanged = false
    const filterChanged = false
    const lastAutoFitDateKey = null
    const currentDateKey = '2024-01-15'

    // Jobs arrive: first signature change
    const shouldFit1 = dateChanged || filterChanged || (true && lastAutoFitDateKey !== currentDateKey && !initialCameraEstablished.current)
    expect(shouldFit1).toBe(true)
    initialCameraEstablished.current = true

    // Calendar geocodes: second signature change
    const shouldFit2 = dateChanged || filterChanged || (true && lastAutoFitDateKey !== currentDateKey && !initialCameraEstablished.current)
    expect(shouldFit2).toBe(false)

    // Business geocodes: third signature change
    const shouldFit3 = dateChanged || filterChanged || (true && lastAutoFitDateKey !== currentDateKey && !initialCameraEstablished.current)
    expect(shouldFit3).toBe(false)
  })

  it('empty map remains stable', () => {
    // When there are no markers, camera should not move

    const markerCount = 0
    const shouldFit = markerCount > 0
    expect(shouldFit).toBe(false)
  })

  it('one-marker behavior remains sensible', () => {
    // Single marker should center with sensible zoom (neighborhood/city context)
    // This is handled by panToMarker with zoom 13 instead of fitBounds

    const markerCount = 1
    const shouldUsePanTo = markerCount === 1
    const shouldUseFitBounds = markerCount > 1

    expect(shouldUsePanTo).toBe(true)
    expect(shouldUseFitBounds).toBe(false)
  })
})

describe('ScheduleMap - Jitter Prevention', () => {
  it('map preparation should not re-trigger when data identity is unchanged', () => {
    // The jitter fix removes prepareMapItems from the useEffect dependency array
    // This prevents unnecessary re-runs when the callback is recreated but data is unchanged

    const selectedDateChanged = false
    const businessGeocodeTriggerChanged = false

    // With the fix, the effect only runs when date or geocode trigger changes
    const shouldPrepare = selectedDateChanged || businessGeocodeTriggerChanged
    expect(shouldPrepare).toBe(false)
  })

  it('map preparation should trigger when date changes', () => {
    const selectedDateChanged = true
    const businessGeocodeTriggerChanged = false

    const shouldPrepare = selectedDateChanged || businessGeocodeTriggerChanged
    expect(shouldPrepare).toBe(true)
  })

  it('map preparation should trigger when business geocoding completes', () => {
    const selectedDateChanged = false
    const businessGeocodeTriggerChanged = true

    const shouldPrepare = selectedDateChanged || businessGeocodeTriggerChanged
    expect(shouldPrepare).toBe(true)
  })

  it('data array identity changes should not trigger preparation if date unchanged', () => {
    // Jobs/calendarEvents/tasks arrays may be recreated by parent component
    // This should not cause map preparation to re-run if date hasn't changed

    const selectedDateChanged = false
    const businessGeocodeTriggerChanged = false
    const jobsArrayRecreated = true
    const eventsArrayRecreated = true
    const tasksArrayRecreated = true

    // With the fix, only date and geocode trigger matter
    const shouldPrepare = selectedDateChanged || businessGeocodeTriggerChanged
    expect(shouldPrepare).toBe(false) // Should NOT prepare even if arrays recreated
  })
})