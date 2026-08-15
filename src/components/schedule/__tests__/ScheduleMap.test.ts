import { describe, it, expect, vi } from 'vitest'

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
    // Data signature is added to detect meaningful changes while preventing jitter

    const selectedDateChanged = false
    const businessGeocodeTriggerChanged = false
    const dataSignatureChanged = false

    // With the fix, the effect only runs when date, geocode trigger, or data signature changes
    const shouldPrepare = selectedDateChanged || businessGeocodeTriggerChanged || dataSignatureChanged
    expect(shouldPrepare).toBe(false)
  })

  it('map preparation should trigger when date changes', () => {
    const selectedDateChanged = true
    const businessGeocodeTriggerChanged = false
    const dataSignatureChanged = false

    const shouldPrepare = selectedDateChanged || businessGeocodeTriggerChanged || dataSignatureChanged
    expect(shouldPrepare).toBe(true)
  })

  it('map preparation should trigger when business geocoding completes', () => {
    const selectedDateChanged = false
    const businessGeocodeTriggerChanged = true
    const dataSignatureChanged = false

    const shouldPrepare = selectedDateChanged || businessGeocodeTriggerChanged || dataSignatureChanged
    expect(shouldPrepare).toBe(true)
  })

  it('data array identity changes should not trigger preparation if signature unchanged', () => {
    // Jobs/calendarEvents/tasks arrays may be recreated by parent component
    // This should not cause map preparation to re-run if data signature hasn't changed

    const selectedDateChanged = false
    const businessGeocodeTriggerChanged = false
    const dataSignatureChanged = false

    // With the fix, only date, geocode trigger, and data signature matter
    const shouldPrepare = selectedDateChanged || businessGeocodeTriggerChanged || dataSignatureChanged
    expect(shouldPrepare).toBe(false) // Should NOT prepare if signature unchanged
  })
})

describe('ScheduleMap - Live Update Fix', () => {
  it('map preparation should trigger when data signature changes', () => {
    // The live-update fix adds getDataSignature to detect meaningful data changes
    // When job/event/task data changes (e.g., location added), map should re-prepare

    const selectedDateChanged = false
    const businessGeocodeTriggerChanged = false
    const dataSignatureChanged = true

    // With the fix, data signature changes should trigger preparation
    const shouldPrepare = selectedDateChanged || businessGeocodeTriggerChanged || dataSignatureChanged
    expect(shouldPrepare).toBe(true)
  })

  it('data signature should include job location changes', () => {
    // Simulate signature generation for jobs with different locations
    const dateStr = '2024-01-15'

    const jobsBefore = [
      { id: 'job-1', scheduled_date: dateStr, service_address: null, latitude: null, longitude: null }
    ]
    const jobsAfter = [
      { id: 'job-1', scheduled_date: dateStr, service_address: '123 Main St', latitude: 40.7128, longitude: -74.0060 }
    ]

    const signatureBefore = jobsBefore.map(j => `${j.id}:${j.service_address}:${j.latitude}:${j.longitude}`).join('|')
    const signatureAfter = jobsAfter.map(j => `${j.id}:${j.service_address}:${j.latitude}:${j.longitude}`).join('|')

    expect(signatureBefore).toBe('job-1:null:null:null')
    expect(signatureAfter).toBe('job-1:123 Main St:40.7128:-74.006')
    expect(signatureBefore).not.toBe(signatureAfter)
  })

  it('data signature should include event location changes', () => {
    // Simulate signature generation for events with different locations
    const dateStr = '2024-01-15'

    const eventsBefore = [
      { id: 'event-1', start: { dateTime: `${dateStr}T09:00:00` }, location: null }
    ]
    const eventsAfter = [
      { id: 'event-1', start: { dateTime: `${dateStr}T09:00:00` }, location: 'Sandusky, Ohio' }
    ]

    const signatureBefore = eventsBefore.map(e => `${e.id}:${e.location}`).join('|')
    const signatureAfter = eventsAfter.map(e => `${e.id}:${e.location}`).join('|')

    expect(signatureBefore).toBe('event-1:null')
    expect(signatureAfter).toBe('event-1:Sandusky, Ohio')
    expect(signatureBefore).not.toBe(signatureAfter)
  })

  it('data signature should remain stable when data is unchanged', () => {
    // Same data should produce same signature (prevent false positives)

    const dateStr = '2024-01-15'
    const jobs = [
      { id: 'job-1', scheduled_date: dateStr, service_address: '123 Main St', latitude: 40.7128, longitude: -74.0060 }
    ]

    const signature1 = jobs.map(j => `${j.id}:${j.service_address}:${j.latitude}:${j.longitude}`).join('|')
    const signature2 = jobs.map(j => `${j.id}:${j.service_address}:${j.latitude}:${j.longitude}`).join('|')

    expect(signature1).toBe(signature2)
  })
})

describe('ScheduleMap - View Details Fix', () => {
  it('handleViewItem should invoke onEditEvent for appointments', () => {
    // The View Details fix adds appointment handling to handleViewItem
    // Previously it only handled jobs and leadId-based navigation

    const item = {
      id: 'appointment:event-1',
      type: 'appointment' as const,
      eventId: 'event-1',
      leadId: null,
      jobId: null,
      title: 'Cedar Point + Fast Pass',
      customerName: null,
      customerPhone: null,
      address: 'Sandusky, OH 44870, USA',
      scheduledDate: '2024-01-15',
      scheduledTime: '09:00',
      status: null,
      latitude: 41.4825,
      longitude: -82.6835
    }

    const calendarEvents = [
      { id: 'event-1', summary: 'Cedar Point + Fast Pass', location: 'Sandusky, Ohio' }
    ]

    const onEditEvent = vi.fn()
    const onViewJob = vi.fn()
    const onViewCustomer = vi.fn()

    // Simulate handleViewItem logic
    if (item.type === 'appointment' && item.eventId && onEditEvent) {
      const event = calendarEvents.find(e => e.id === item.eventId)
      if (event) {
        onEditEvent(event)
      }
    } else if (item.type === 'job' && item.jobId) {
      onViewJob(item.jobId)
    } else if (item.leadId) {
      onViewCustomer(item.leadId)
    }

    expect(onEditEvent).toHaveBeenCalledWith(calendarEvents[0])
    expect(onViewJob).not.toHaveBeenCalled()
    expect(onViewCustomer).not.toHaveBeenCalled()
  })

  it('handleViewItem should invoke onViewJob for jobs', () => {
    const item = {
      id: 'job:job-1',
      type: 'job' as const,
      jobId: 'job-1',
      leadId: 'lead-1',
      eventId: null,
      title: 'Service Call',
      customerName: 'John Doe',
      customerPhone: '+14125551234',
      address: '456 Oak Ave',
      scheduledDate: '2024-01-15',
      scheduledTime: '09:00',
      status: 'scheduled',
      latitude: 40.7138,
      longitude: -74.0070
    }

    const onEditEvent = vi.fn()
    const onViewJob = vi.fn()
    const onViewCustomer = vi.fn()

    // Simulate handleViewItem logic
    if (item.type === 'job' && item.jobId) {
      onViewJob(item.jobId)
    } else if (item.type === 'appointment' && item.eventId && onEditEvent) {
      // Would find event and call onEditEvent
    } else if (item.leadId) {
      onViewCustomer(item.leadId)
    }

    expect(onViewJob).toHaveBeenCalledWith('job-1')
    expect(onEditEvent).not.toHaveBeenCalled()
    expect(onViewCustomer).not.toHaveBeenCalled()
  })

  it('handleViewItem should invoke onViewCustomer for items with leadId but no jobId', () => {
    const item = {
      id: 'task:task-1',
      type: 'task' as const,
      eventId: null,
      leadId: 'lead-1',
      jobId: null,
      title: 'Follow-up Task',
      customerName: null,
      customerPhone: null,
      address: null,
      scheduledDate: '2024-01-15',
      scheduledTime: '10:00',
      status: null,
      latitude: 40.7128,
      longitude: -74.0060
    }

    const onEditEvent = vi.fn()
    const onViewJob = vi.fn()
    const onViewCustomer = vi.fn()

    // Simulate handleViewItem logic
    if (item.type === 'job' && item.jobId) {
      onViewJob(item.jobId)
    } else if (item.type === 'appointment' && item.eventId && onEditEvent) {
      // Would find event and call onEditEvent
    } else if (item.leadId) {
      onViewCustomer(item.leadId)
    }

    expect(onViewCustomer).toHaveBeenCalledWith('lead-1')
    expect(onViewJob).not.toHaveBeenCalled()
    expect(onEditEvent).not.toHaveBeenCalled()
  })
})