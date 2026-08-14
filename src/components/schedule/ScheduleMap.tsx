'use client'

import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react'
import { MapPin, Calendar, Briefcase, AlertCircle, ChevronLeft, ChevronRight, Filter, ArrowLeft, ArrowRight, Layers } from 'lucide-react'
import Link from 'next/link'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

// Check if Google Maps API is fully initialized
function isGoogleMapsReady(): boolean {
  if (typeof window === 'undefined') return false
  const g = (window as any).google
  return !!(
    g?.maps?.Map &&
    g?.maps?.MapTypeId &&
    g?.maps?.Marker &&
    g?.maps?.LatLngBounds
  )
}

// Poll for Google Maps readiness after script loads
function waitForGoogleMapsReady(callback: () => void, onTimeout?: () => void, maxAttempts = 80, interval = 100): void {
  let attempts = 0
  const check = () => {
    if (isGoogleMapsReady()) {
      callback()
    } else if (attempts < maxAttempts) {
      attempts++
      setTimeout(check, interval)
    } else {
      console.error('[ScheduleMap] Google Maps API did not initialize within expected time')
      if (onTimeout) {
        onTimeout()
      }
    }
  }
  check()
}

interface Job {
  id: string
  title: string
  customer_name: string | null
  customer_phone: string | null
  service_address: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  status: string
  lead_id: string | null
  latitude?: number | null
  longitude?: number | null
  geocoded_address?: string | null
  google_calendar_event_id?: string | null
  leads?: {
    id: string
    raw_metadata: any
  } | null
}

interface CalendarEvent {
  id: string
  summary: string
  location: string | null
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

interface Task {
  id: string
  title: string
  notes: string | null
  due_date: string | null
  due_time: string | null
  completed: boolean
  lead_id: string | null
  job_id: string | null
}

interface Business {
  id: string
  name: string | null
  business_address_line1?: string | null
  business_address_line2?: string | null
  business_address_city?: string | null
  business_address_state?: string | null
  business_address_postal_code?: string | null
  business_address_country?: string | null
}

interface ScheduleMapProps {
  jobs: Job[]
  calendarEvents: CalendarEvent[]
  tasks: Task[]
  selectedDate: Date
  business?: Business | null
  onPreviousDay: () => void
  onNextDay: () => void
  onGoToToday: () => void
  onViewCustomer: (leadId: string) => void
  onViewJob: (jobId: string) => void
  onEditJob?: (job: Job) => void
  onEditTask?: (task: Task) => void
  onEditEvent?: (event: CalendarEvent) => void
  onAddLocationJob?: (job: Job) => void
  onAddLocationEvent?: (event: CalendarEvent) => void
}

type MapItemType = 'job' | 'appointment' | 'task' | 'business'

type MapFilter = 'all' | 'jobs' | 'appointments'

type MapType = 'roadmap' | 'satellite'

interface MapDateState {
  selectedMapItemId: string | null
  filter: MapFilter
  center: { lat: number; lng: number } | null
  zoom: number | null
  userInteracted: boolean
}

interface MapItem {
  id: string
  type: MapItemType
  title: string
  customerName: string | null
  customerPhone: string | null
  address: string
  scheduledDate: string | null
  scheduledTime: string | null
  status: string | null
  leadId: string | null
  jobId: string | null
  latitude: number
  longitude: number
  stopNumber?: number
}

interface MarkerInfo {
  position: { lat: number; lng: number }
  items: MapItem[]
}

// Marker icon cache to avoid recreating identical canvas icons
const markerIconCache = new Map<string, any>()

// Global map instance counter for debugging recreation
let mapInstanceCounter = 0

function ScheduleMapComponent({
  jobs,
  calendarEvents,
  tasks,
  selectedDate,
  business,
  onPreviousDay,
  onNextDay,
  onGoToToday,
  onViewCustomer,
  onViewJob,
  onEditJob,
  onEditTask,
  onEditEvent,
  onAddLocationJob,
  onAddLocationEvent
}: ScheduleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const googleMapRef = useRef<any>(null)
  const mapInstanceIdRef = useRef<string>(`map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
  const renderCountRef = useRef(0)
  const lastCameraStateRef = useRef<{ center: { lat: number; lng: number }; zoom: number } | null>(null)
  const lastLogTimeRef = useRef<{ [key: string]: number }>({}) // For throttling high-frequency events
  const markersRef = useRef<Map<string, any>>(new Map()) // Marker registry keyed by item ID
  const perDateStateRef = useRef<Map<string, MapDateState>>(new Map())
  const calendarEventCoordsCacheRef = useRef<Map<string, { lat: number; lng: number; formattedAddress: string } | null>>(new Map()) // Cache for calendar event coordinates (null = failed geocode)
  const businessCoordsCacheRef = useRef<{ lat: number; lng: number; formattedAddress: string } | null>(null) // Cache for business coordinates
  const lastBusinessAddressRef = useRef<string | null>(null) // Track last business address for invalidation
  const programmaticCameraChangeRef = useRef(false) // Guard to distinguish user vs programmatic movement
  const pendingProgrammaticMoveRef = useRef(false) // Track if a programmatic move is in progress
  const mapPreparationIdRef = useRef(0) // Monotonically increasing ID to prevent stale async results
  const markerSetSignatureRef = useRef<string>('') // Signature of current marker set to prevent repeated fitBounds
  const newlyMappableEventIdRef = useRef<string | null>(null) // Track newly mappable event for one-time camera adjustment
  const initialCameraEstablishedRef = useRef(false) // Track if initial camera positioning has been done
  const previousMapFilterRef = useRef<MapFilter>('all') // Track previous filter to detect changes
  const resizeLastSizeRef = useRef<{ width: number; height: number } | null>(null) // Move ref to top level
  const [businessGeocodeTrigger, setBusinessGeocodeTrigger] = useState(0) // Counter to trigger map items refresh when business geocoding completes
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)
  const [selectedMarker, setSelectedMarker] = useState<MarkerInfo | null>(null)
  const [selectedMapItemId, setSelectedMapItemId] = useState<string | null>(null)
  const [selectedListItem, setSelectedListItem] = useState<any>(null)
  const [mapItems, setMapItems] = useState<MapItem[]>([])
  const [mapFilter, setMapFilter] = useState<MapFilter>('all')
  const [mapType, setMapType] = useState<MapType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('replyflow_schedule_map_type')
      if (saved === 'satellite' || saved === 'roadmap') {
        return saved
      }
    }
    return 'roadmap'
  })
  const userInteractedRef = useRef(false) // Use ref to prevent re-renders
  const [showAllMode, setShowAllMode] = useState(true)
  const [previousDateKey, setPreviousDateKey] = useState<string | null>(null)
  const [lastAutoFitDateKey, setLastAutoFitDateKey] = useState<string | null>(null) // Track when we last auto-fitted to prevent repeated fits

  // TEMPORARY: Performance diagnostic switch - disable high-frequency logging to test smoothness
  const enableHighFrequencyDiagnostics = useRef(false)

  // Increment render count
  renderCountRef.current++
  const currentRenderCount = renderCountRef.current

  // Track prop changes for render logging
  const jobsIdentityChanged = useRef(false)
  const calendarEventsIdentityChanged = useRef(false)
  const tasksIdentityChanged = useRef(false)
  const selectedDateChanged = useRef(false)
  const businessLocationChanged = useRef(false)

  // Detect prop identity changes
  if (jobsIdentityChanged.current === false) {
    jobsIdentityChanged.current = true
  }
  if (calendarEventsIdentityChanged.current === false) {
    calendarEventsIdentityChanged.current = true
  }
  if (tasksIdentityChanged.current === false) {
    tasksIdentityChanged.current = true
  }

  // Log renders (throttled - every 5th render or on significant changes)
  const shouldLogRender = currentRenderCount % 5 === 0 || currentRenderCount === 1
  if (shouldLogRender) {
    console.log('[SCHEDULE_MAP_RENDER]', {
      count: currentRenderCount,
      mapInstance: mapInstanceIdRef.current,
      mapReady,
      jobsCount: jobs.length,
      eventsCount: calendarEvents.length,
      tasksCount: tasks.length,
      selectedDate: selectedDate.toISOString(),
      mapItemsCount: mapItems.length,
      userInteracted: userInteractedRef.current,
      showAllMode,
      mapFilter
    })
  }

  // Persist map type preference
  useEffect(() => {
    localStorage.setItem('replyflow_schedule_map_type', mapType)
  }, [mapType])

  // Update map type when state changes (only after map is ready)
  useEffect(() => {
    if (mapReady && googleMapRef.current) {
      // Verify API is actually ready before accessing MapTypeId
      if (!isGoogleMapsReady()) {
        console.error('[ScheduleMap] Google Maps API not ready during map type update')
        return
      }

      try {
        const mapTypeId = mapType === 'satellite'
          ? (window as any).google.maps.MapTypeId.HYBRID
          : (window as any).google.maps.MapTypeId.ROADMAP
        googleMapRef.current.setMapTypeId(mapTypeId)
      } catch (error) {
        console.error('[ScheduleMap] Failed to update map type:', error)
      }
    }
  }, [mapType, mapReady])

  // Format canonical business address
  const formatBusinessAddress = useCallback((biz: Business | null | undefined): string | null => {
    if (!biz) return null

    const parts = [
      biz.business_address_line1,
      biz.business_address_line2,
      biz.business_address_city,
      biz.business_address_state,
      biz.business_address_postal_code,
      biz.business_address_country
    ].filter(Boolean)

    return parts.length > 0 ? parts.join(', ') : null
  }, [])

  // Geocode business address using existing API endpoint (consistent with calendar events)
  const geocodeBusinessAddress = useCallback(async (address: string): Promise<{ lat: number; lng: number; formattedAddress: string } | null> => {
    try {
      const response = await fetch('/api/geocode/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      const result = await response.json()
      if (result.success) {
        console.log('[SCHEDULE_MAP_BUSINESS_GEOCODE]', {
          success: true,
          hasCity: !!result.formattedAddress,
          resultState: result.state || result.region || 'unknown',
          resultCountry: result.country || 'unknown'
        })
        return {
          lat: result.latitude,
          lng: result.longitude,
          formattedAddress: result.formattedAddress
        }
      }
      console.log('[SCHEDULE_MAP_BUSINESS_GEOCODE]', {
        success: false,
        error: result.error || 'unknown'
      })
      return null
    } catch (error) {
      console.log('[ScheduleMap] Business geocoding request failed')
      return null
    }
  }, [])

  // Geocode business address when it changes
  useEffect(() => {
    if (!business) {
      businessCoordsCacheRef.current = null
      lastBusinessAddressRef.current = null
      return
    }

    const businessAddress = formatBusinessAddress(business)
    if (!businessAddress) {
      console.log('[SCHEDULE_MAP_BUSINESS_ADDRESS]', {
        hasAddress: false,
        hasLine1: !!business.business_address_line1,
        hasCity: !!business.business_address_city,
        hasState: !!business.business_address_state,
        hasPostal: !!business.business_address_postal_code,
        hasCountry: !!business.business_address_country
      })
      businessCoordsCacheRef.current = null
      lastBusinessAddressRef.current = null
      return
    }

    // Check if address has changed
    if (lastBusinessAddressRef.current === businessAddress) {
      return
    }

    lastBusinessAddressRef.current = businessAddress

    console.log('[SCHEDULE_MAP_BUSINESS_ADDRESS]', {
      hasAddress: true,
      hasLine1: !!business.business_address_line1,
      hasCity: !!business.business_address_city,
      hasState: !!business.business_address_state,
      hasPostal: !!business.business_address_postal_code,
      hasCountry: !!business.business_address_country,
      state: business.business_address_state || 'missing',
      country: business.business_address_country || 'missing'
    })

    // Geocode the address using API (no Google Maps dependency)
    const geocode = async () => {
      const result = await geocodeBusinessAddress(businessAddress)
      if (result) {
        businessCoordsCacheRef.current = result
        console.log('[ScheduleMap] Business geocoded: success=true')

        // If map is ready and user hasn't interacted yet, center on business location
        // This handles the case where geocoding completes after initial render
        if (mapReady && googleMapRef.current && !userInteractedRef.current) {
          const dateKey = selectedDate.toISOString().split('T')[0]
          const savedState = perDateStateRef.current.get(dateKey)
          // Only center if there's no saved state for this date
          if (!savedState) {
            logCameraCommand('business_geocode_center', 'setCenter+setZoom', {
              center: `${result.lat},${result.lng}`,
              zoom: 13,
              reason: 'business_location_after_geocode'
            })
            programmaticCameraChangeRef.current = true
            pendingProgrammaticMoveRef.current = true
            googleMapRef.current.setCenter({ lat: result.lat, lng: result.lng })
            googleMapRef.current.setZoom(13)
          }
        }

        // Trigger immediate map items refresh to show business marker
        // This fixes the timing issue where marker wouldn't appear until next date change
        setBusinessGeocodeTrigger(prev => prev + 1)
      } else {
        businessCoordsCacheRef.current = null
        console.log('[ScheduleMap] Business geocoding: success=false')
      }
    }

    geocode()
  }, [business, formatBusinessAddress, geocodeBusinessAddress])

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  // Format time for display
  const formatTime = (time: string | null) => {
    if (!time) return ''
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  // Log camera state with deltas (NO precise coordinates - privacy-safe)
  const logCameraState = useCallback((event: string, reason: string = '') => {
    if (!googleMapRef.current) return

    // Skip expensive payload construction if high-frequency diagnostics are disabled
    // Only low-frequency events (dragstart, dragend, idle, explicit commands) should log
    if (!enableHighFrequencyDiagnostics.current) {
      const lowFrequencyEvents = ['dragstart', 'dragend', 'idle', 'container_resize', 'marker_update']
      if (!lowFrequencyEvents.includes(event)) {
        return
      }
    }

    const center = googleMapRef.current.getCenter()
    const zoom = googleMapRef.current.getZoom()
    const bounds = googleMapRef.current.getBounds()
    const container = mapRef.current

    const currentState = {
      center: { lat: center.lat(), lng: center.lng() },
      zoom
    }

    let deltaInfo = ''
    if (lastCameraStateRef.current) {
      const deltaLat = Math.abs(currentState.center.lat - lastCameraStateRef.current.center.lat)
      const deltaLng = Math.abs(currentState.center.lng - lastCameraStateRef.current.center.lng)
      const deltaZoom = Math.abs(currentState.zoom - lastCameraStateRef.current.zoom)
      deltaInfo = `deltaLat=${deltaLat.toFixed(6)} deltaLng=${deltaLng.toFixed(6)} deltaZoom=${deltaZoom.toFixed(2)}`
    }

    lastCameraStateRef.current = currentState

    const containerWidth = container?.offsetWidth || 0
    const containerHeight = container?.offsetHeight || 0

    console.log('[SCHEDULE_MAP_CAMERA_STATE]', {
      event,
      reason,
      zoom: currentState.zoom.toFixed(2),
      mapInstance: mapInstanceIdRef.current,
      container: `${containerWidth}x${containerHeight}`,
      deltaInfo,
      userInteracted: userInteractedRef.current,
      timestamp: Date.now()
    })
  }, [])

  // Log camera commands with full details (NO precise coordinates - privacy-safe)
  const logCameraCommand = useCallback((source: string, command: string, details: any) => {
    console.log('[SCHEDULE_MAP_CAMERA_COMMAND]', {
      source,
      command,
      zoom: details.zoom || 'N/A',
      reason: details.reason || 'N/A',
      userInteracted: userInteractedRef.current,
      mapInstance: mapInstanceIdRef.current,
      timestamp: Date.now()
    })
  }, [])

  // Throttled logging for high-frequency events (100ms minimum between logs per event type)
  const logThrottled = useCallback((eventType: string, logFn: () => void) => {
    const now = Date.now()
    const lastLog = lastLogTimeRef.current[eventType] || 0
    if (now - lastLog > 100) {
      lastLogTimeRef.current[eventType] = now
      logFn()
    }
  }, [])

  // Filter items for selected date
  const getItemsForDate = useCallback(() => {
    // Use local timezone to match database dates (YYYY-MM-DD format)
    const dateStr = selectedDate.toLocaleDateString('en-CA')

    const filteredJobs = jobs.filter(job => {
      if (!job.scheduled_date) return false
      return job.scheduled_date === dateStr
    })

    const filteredEvents = calendarEvents.filter(event => {
      const eventDate = event.start.dateTime || event.start.date
      if (!eventDate) return false
      return eventDate.startsWith(dateStr)
    })

    return { filteredJobs, filteredEvents }
  }, [jobs, calendarEvents, selectedDate])

  // Filter map items by type
  const getFilteredMapItems = useCallback((items: MapItem[]): MapItem[] => {
    if (mapFilter === 'all') return items
    return items.filter(item => item.type === mapFilter.slice(0, -1) as MapItemType)
  }, [mapFilter])

  // Reset auto-fit tracking when filter changes (so map will refit to filtered markers)
  useEffect(() => {
    setLastAutoFitDateKey(null)
  }, [mapFilter])

  // Clear selection if selected item is filtered out
  useEffect(() => {
    if (selectedMapItemId) {
      const filteredItems = getFilteredMapItems(mapItems)
      const isSelectedVisible = filteredItems.some(item => item.id === selectedMapItemId)
      if (!isSelectedVisible) {
        setSelectedMapItemId(null)
        setShowAllMode(true)
        // Do NOT reset userInteracted - user owns the camera
      }
    }
  }, [mapFilter, mapItems, selectedMapItemId, getFilteredMapItems])

  // Get sorted mapped items for navigation with stop numbering
  const getSortedMappedItems = useCallback((items: MapItem[]): MapItem[] => {
    return [...items]
      .sort((a, b) => {
        const timeA = a.scheduledTime || '00:00'
        const timeB = b.scheduledTime || '00:00'
        return timeA.localeCompare(timeB)
      })
      .map((item, index) => ({ ...item, stopNumber: index + 1 }))
  }, [])

  // Fit bounds with max zoom constraint and bottom padding for nav
  const fitBoundsWithMaxZoom = useCallback((bounds: any, maxZoom: number = 15, paddingBottom: number = 0, reason: string = 'unknown') => {
    if (!googleMapRef.current) return

    logCameraCommand('fitBoundsWithMaxZoom', 'fitBounds', { reason, maxZoom, paddingBottom })

    // Check if bounds would actually change viewport (avoid no-op calls)
    const currentBounds = googleMapRef.current.getBounds()
    const ne = bounds.getNorthEast()
    const sw = bounds.getSouthWest()
    const currentNe = currentBounds.getNorthEast()
    const currentSw = currentBounds.getSouthWest()
    const isSameBounds = Math.abs(ne.lat() - currentNe.lat()) < 0.000001 &&
                       Math.abs(ne.lng() - currentNe.lng()) < 0.000001 &&
                       Math.abs(sw.lat() - currentSw.lat()) < 0.000001 &&
                       Math.abs(sw.lng() - currentSw.lng()) < 0.000001

    if (isSameBounds) {
      logCameraCommand('fitBoundsWithMaxZoom', 'fitBounds', { reason, result: 'skipped_no_change' })
      return
    }

    programmaticCameraChangeRef.current = true
    pendingProgrammaticMoveRef.current = true

    // Apply bottom padding if specified (for bottom nav)
    if (paddingBottom > 0) {
      googleMapRef.current.fitBounds(bounds, 0, 0, 0, paddingBottom)
    } else {
      googleMapRef.current.fitBounds(bounds)
    }

    // Ensure we don't zoom in too much
    const listener = googleMapRef.current.addListener('bounds_changed', () => {
      const currentZoom = googleMapRef.current.getZoom()
      if (currentZoom > maxZoom) {
        googleMapRef.current.setZoom(maxZoom)
      }
      // Remove listener after first execution
      (window as any).google.maps.event.removeListener(listener)
    })
  }, [logCameraCommand])

  // Pan to marker without resetting bounds
  const panToMarker = useCallback((lat: number, lng: number, zoom?: number, setUserInteractedFlag: boolean = true, reason: string = 'unknown') => {
    if (!googleMapRef.current) return

    logCameraCommand('panToMarker', 'panTo', { center: `${lat},${lng}`, zoom, reason, setUserInteractedFlag })

    // Check if this is actually a camera change (avoid no-op calls)
    const currentCenter = googleMapRef.current.getCenter()
    const currentZoom = googleMapRef.current.getZoom()
    const isSameCenter = Math.abs(currentCenter.lat() - lat) < 0.000001 && Math.abs(currentCenter.lng() - lng) < 0.000001
    const isSameZoom = zoom === undefined || Math.abs(currentZoom - zoom) < 0.01

    if (isSameCenter && isSameZoom) {
      logCameraCommand('panToMarker', 'panTo', { reason, result: 'skipped_no_change' })
      return
    }

    programmaticCameraChangeRef.current = true
    pendingProgrammaticMoveRef.current = true
    googleMapRef.current.panTo({ lat, lng })
    if (zoom !== undefined) {
      googleMapRef.current.setZoom(zoom)
    }
    if (setUserInteractedFlag) {
      userInteractedRef.current = true
    }
  }, [logCameraCommand])

  // Reset to show all markers
  const showAllMarkers = useCallback(() => {
    setSelectedMapItemId(null)
    setShowAllMode(true)
    userInteractedRef.current = false

    if (!googleMapRef.current || markersRef.current.size === 0) return

    const bounds = new (window as any).google.maps.LatLngBounds()
    markersRef.current.forEach(marker => {
      bounds.extend(marker.getPosition()!)
    })

    const bottomNavHeight = typeof window !== 'undefined'
      ? parseInt(getComputedStyle(document.body).getPropertyValue('--bottom-nav-height')) || 80
      : 80
    const bottomPadding = bottomNavHeight + 40

    fitBoundsWithMaxZoom(bounds, 15, bottomPadding, 'show_all_markers')
  }, [fitBoundsWithMaxZoom])

  // Navigate to next/previous stop
  const navigateToStop = useCallback((direction: 'next' | 'previous') => {
    const filteredItems = getFilteredMapItems(mapItems)
    const sortedItems = getSortedMappedItems(filteredItems)
    
    if (sortedItems.length === 0) return
    
    let currentIndex = selectedMapItemId 
      ? sortedItems.findIndex(item => item.id === selectedMapItemId)
      : -1
    
    if (direction === 'next') {
      currentIndex = (currentIndex + 1) % sortedItems.length
    } else {
      currentIndex = currentIndex <= 0 ? sortedItems.length - 1 : currentIndex - 1
    }
    
    const selectedItem = sortedItems[currentIndex]
    setSelectedMapItemId(selectedItem.id)
    setShowAllMode(false)
    panToMarker(selectedItem.latitude, selectedItem.longitude, 15, true, 'navigate_to_stop')
  }, [selectedMapItemId, mapItems, getFilteredMapItems, getSortedMappedItems, panToMarker])

  // Select a specific map item
  const selectMapItem = useCallback((itemId: string) => {
    const filteredItems = getFilteredMapItems(mapItems)
    const item = filteredItems.find(i => i.id === itemId)
    if (!item) return
    
    setSelectedMapItemId(itemId)
    setShowAllMode(false)
    panToMarker(item.latitude, item.longitude, 15, true, 'select_map_item')
  }, [mapItems, getFilteredMapItems, panToMarker])

  // Helper function to extract customer address from lead metadata
  const getCustomerAddressFromLead = (job: Job): string | null => {
    if (!job.leads?.raw_metadata) return null

    const rawMetadata = job.leads.raw_metadata

    // Check for various address field names in raw_metadata
    const addressFields = [
      rawMetadata.addressOrLocation,
      rawMetadata.serviceAddress,
      rawMetadata.address,
      rawMetadata.location,
      rawMetadata.extracted_info?.addressOrLocation,
      rawMetadata.extracted_info?.serviceAddress,
      rawMetadata.extracted_info?.address,
      rawMetadata.ai_extracted_info?.addressOrLocation,
      rawMetadata.ai_extracted_info?.serviceAddress,
      rawMetadata.ai_extracted_info?.address,
    ]

    for (const field of addressFields) {
      if (field && typeof field === 'string' && field.trim().length > 0) {
        return field.trim()
      }
    }

    return null
  }

  // Get all items for the selected date (jobs, events, tasks) for the list view
  const getSelectedDayItems = useCallback((): Array<{
    id: string
    type: 'job' | 'appointment' | 'task'
    title: string
    customerName: string | null
    address: string | null
    scheduledDate: string | null
    scheduledTime: string | null
    status: string | null
    hasLocation: boolean
    leadId: string | null
    jobId: string | null
    taskId: string | null
    eventId: string | null
    latitude: number | null
    longitude: number | null
  }> => {
    const dateStr = selectedDate.toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
    const items: Array<{
    id: string
    type: 'job' | 'appointment' | 'task'
    title: string
    customerName: string | null
    address: string | null
    scheduledDate: string | null
    scheduledTime: string | null
    status: string | null
    hasLocation: boolean
    leadId: string | null
    jobId: string | null
    taskId: string | null
    eventId: string | null
    latitude: number | null
    longitude: number | null
  }> = []

    // Filter jobs for selected date
    const filteredJobs = jobs.filter(job => {
      if (!job.scheduled_date) return false
      return job.scheduled_date === dateStr
    })

    // Filter events for selected date
    const filteredEvents = calendarEvents.filter(event => {
      const eventDate = event.start.dateTime || event.start.date
      if (!eventDate) return false
      return eventDate.startsWith(dateStr)
    })

    // Deduplicate: exclude calendar events that are linked to jobs
    const jobLinkedEventIds = new Set(
      filteredJobs
        .filter(job => job.google_calendar_event_id)
        .map(job => job.google_calendar_event_id!)
    )
    const deduplicatedEvents = filteredEvents.filter(event => !jobLinkedEventIds.has(event.id))

    // Filter tasks for selected date
    const filteredTasks = tasks.filter(task => {
      if (!task.due_date) return false
      return task.due_date === dateStr && !task.completed
    })

    // Process jobs
    filteredJobs.forEach(job => {
      const fallbackAddress = getCustomerAddressFromLead(job)
      const serviceAddress = job.service_address || fallbackAddress
      const hasCoordinates = job.latitude !== null && job.latitude !== undefined && job.longitude !== null && job.longitude !== undefined
      const hasLocation = Boolean(serviceAddress) || hasCoordinates

      items.push({
        id: `job:${job.id}`,
        type: 'job',
        title: job.title,
        customerName: job.customer_name,
        address: serviceAddress,
        scheduledDate: job.scheduled_date,
        scheduledTime: job.scheduled_time,
        status: job.status,
        hasLocation,
        leadId: job.lead_id,
        jobId: job.id,
        taskId: null,
        eventId: null,
        latitude: job.latitude || null,
        longitude: job.longitude || null
      })
    })

    // Process events
    deduplicatedEvents.forEach(event => {
      const hasLocation = Boolean(event.location)

      items.push({
        id: `appointment:${event.id}`,
        type: 'appointment',
        title: event.summary,
        customerName: null,
        address: event.location,
        scheduledDate: (event.start.dateTime || event.start.date)?.split('T')[0] || null,
        scheduledTime: event.start.dateTime ? event.start.dateTime.split('T')[1]?.substring(0, 5) || null : null,
        status: null,
        hasLocation,
        leadId: null,
        jobId: null,
        taskId: null,
        eventId: event.id,
        latitude: null,
        longitude: null
      })
    })

    // Process tasks
    filteredTasks.forEach(task => {
      items.push({
        id: `task:${task.id}`,
        type: 'task',
        title: task.title,
        customerName: null,
        address: null,
        scheduledDate: task.due_date,
        scheduledTime: task.due_time,
        status: task.completed ? 'completed' : 'pending',
        hasLocation: false,
        leadId: task.lead_id,
        jobId: task.job_id,
        taskId: task.id,
        eventId: null,
        latitude: null,
        longitude: null
      })
    })

    // Sort chronologically by time
    items.sort((a, b) => {
      const timeA = a.scheduledTime || '00:00'
      const timeB = b.scheduledTime || '00:00'
      return timeA.localeCompare(timeB)
    })

    return items
  }, [jobs, calendarEvents, tasks, selectedDate, getCustomerAddressFromLead])

  // Geocode addresses and prepare map items
  const prepareMapItems = useCallback(async (preparationId: number) => {
    const { filteredJobs, filteredEvents } = getItemsForDate()
    const items: MapItem[] = []

    // Process jobs
    for (const job of filteredJobs) {
      // Extract fallback address from lead metadata
      const fallbackAddress = getCustomerAddressFromLead(job)

      // Use service_address, or fall back to customer address from lead metadata
      const serviceAddress = job.service_address || fallbackAddress

      const hasCoordinates = job.latitude !== null && job.latitude !== undefined && job.longitude !== null && job.longitude !== undefined

      // Skip jobs without address
      if (!serviceAddress) {
        continue
      }

      // Check if already geocoded
      if (hasCoordinates) {
        items.push({
          id: job.id,
          type: 'job',
          title: job.title,
          customerName: job.customer_name,
          customerPhone: job.customer_phone,
          address: serviceAddress,
          scheduledDate: job.scheduled_date,
          scheduledTime: job.scheduled_time,
          status: job.status,
          leadId: job.lead_id,
          jobId: job.id,
          latitude: job.latitude!,
          longitude: job.longitude!
        })
      } else {
        // Validate inputs before geocoding request
        const normalizedAddress = serviceAddress.trim()
        if (!normalizedAddress || normalizedAddress.length === 0) {
          continue
        }

        if (!job.id) {
          console.error('[ScheduleMap] Missing jobId for geocoding request')
          continue
        }

        // Trigger geocoding
        try {
          const response = await fetch('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'geocode', jobId: job.id, address: normalizedAddress })
          })
          const result = await response.json()
          if (result.success) {
            items.push({
              id: job.id,
              type: 'job',
              title: job.title,
              customerName: job.customer_name,
              customerPhone: job.customer_phone,
              address: serviceAddress,
              scheduledDate: job.scheduled_date,
              scheduledTime: job.scheduled_time,
              status: job.status,
              leadId: job.lead_id,
              jobId: job.id,
              latitude: result.latitude,
              longitude: result.longitude
            })
          } else {
            console.error('[ScheduleMap] Geocoding failed for job:', job.id, result.error)
          }
        } catch (error) {
          console.error('[ScheduleMap] Geocoding exception for job:', job.id, error)
        }
      }
    }

    // Process calendar events
    for (const event of filteredEvents) {
      // Skip events without location
      if (!event.location) {
        continue
      }

      const normalizedLocation = event.location.trim()
      if (!normalizedLocation || normalizedLocation.length === 0) {
        continue
      }

      // Check cache first (key includes location to detect changes)
      const cacheKey = `appointment:${event.id}:${normalizedLocation}`
      const cached = calendarEventCoordsCacheRef.current.get(cacheKey)

      if (cached) {
        // Check if this is a negative cache entry (failed geocode)
        if (cached === null) {
          // Previously failed to geocode this exact address - skip
          continue
        }

        const dateTime = event.start.dateTime
        const dateOnly = event.start.date
        items.push({
          id: `appointment:${event.id}`,
          type: 'appointment',
          title: event.summary,
          customerName: null,
          customerPhone: null,
          address: cached.formattedAddress,
          scheduledDate: dateTime ? dateTime.split('T')[0] : (dateOnly || null),
          scheduledTime: dateTime ? (dateTime.split('T')[1]?.slice(0, 5) || null) : null,
          status: null,
          leadId: null,
          jobId: null,
          latitude: cached.lat,
          longitude: cached.lng
        })
      } else {
        // Geocode the calendar event location
        try {
          const response = await fetch('/api/geocode/address', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: normalizedLocation })
          })
          const result = await response.json()
          if (result.success) {
            // Cache the result
            calendarEventCoordsCacheRef.current.set(cacheKey, {
              lat: result.latitude,
              lng: result.longitude,
              formattedAddress: result.formattedAddress || normalizedLocation
            })

            const dateTime = event.start.dateTime
            const dateOnly = event.start.date
            items.push({
              id: `appointment:${event.id}`,
              type: 'appointment',
              title: event.summary,
              customerName: null,
              customerPhone: null,
              address: result.formattedAddress || normalizedLocation,
              scheduledDate: dateTime ? dateTime.split('T')[0] : (dateOnly || null),
              scheduledTime: dateTime ? (dateTime.split('T')[1]?.slice(0, 5) || null) : null,
              status: null,
              leadId: null,
              jobId: null,
              latitude: result.latitude,
              longitude: result.longitude
            })
          } else {
            // Cache the failure as null to prevent repeated geocoding
            calendarEventCoordsCacheRef.current.set(cacheKey, null)
            console.error('[ScheduleMap] Geocoding failed for calendar event:', event.id, result.error)
          }
        } catch (error) {
          // Cache the failure as null to prevent repeated geocoding
          calendarEventCoordsCacheRef.current.set(cacheKey, null)
          console.error('[ScheduleMap] Geocoding exception for calendar event:', event.id, error)
        }
      }
    }

    // Add business location marker if available
    const businessCoords = businessCoordsCacheRef.current
    if (businessCoords && business) {
      items.push({
        id: 'business:home',
        type: 'business',
        title: business.name || 'Business',
        customerName: null,
        customerPhone: null,
        address: businessCoords.formattedAddress,
        scheduledDate: null,
        scheduledTime: null,
        status: 'business',
        leadId: null,
        jobId: null,
        latitude: businessCoords.lat,
        longitude: businessCoords.lng
      })
    }

    // Check if this preparation is still the most recent (prevents stale async results)
    if (preparationId !== mapPreparationIdRef.current) {
      return
    }

    setMapItems(items)
    setIsLoading(false)
  }, [getItemsForDate])

  // Group items by location (for clustering)
  const groupItemsByLocation = useCallback((items: MapItem[]): MarkerInfo[] => {
    const locationGroups = new Map<string, MapItem[]>()

    items.forEach(item => {
      const key = `${item.latitude.toFixed(6)},${item.longitude.toFixed(6)}`
      if (!locationGroups.has(key)) {
        locationGroups.set(key, [])
      }
      locationGroups.get(key)!.push(item)
    })

    return Array.from(locationGroups.entries()).map(([key, items]) => ({
      position: {
        lat: items[0].latitude,
        lng: items[0].longitude
      },
      items
    }))
  }, [])

  // Load Google Maps script using singleton pattern
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      const error = 'Google Maps API key is not configured'
      console.error('[ScheduleMap]', error)
      setMapError(error)
      setIsLoading(false)
      return
    }

    // Check if API is already fully ready (script state alone is insufficient)
    if (isGoogleMapsReady()) {
      setIsMapLoaded(true)
      return
    }

    // Check if Google Maps script is already injected to prevent duplicate injection
    const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')
    if (existingScript) {
      // Script already exists, wait for API to become ready
      waitForGoogleMapsReady(() => {
        setIsMapLoaded(true)
      }, () => {
        console.error('[ScheduleMap] Google Maps API initialization timeout (existing script)')
        setMapError('Unable to load Google Maps. Please try again.')
        setIsLoading(false)
      })
      return
    }

    // Load script only once using Google Maps recommended async pattern
    const script = document.createElement('script')
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + apiKey + '&libraries=places&loading=async'

    script.onload = () => {
      // Wait for Google Maps API to be fully initialized
      waitForGoogleMapsReady(() => {
        setIsMapLoaded(true)
      }, () => {
        // Timeout callback - set error state instead of hanging on loading skeleton
        console.error('[ScheduleMap] Google Maps API initialization timeout')
        setMapError('Unable to load Google Maps. Please try again.')
        setIsLoading(false)
      })
    }

    script.onerror = () => {
      const error = 'Failed to load Google Maps script'
      console.error('[ScheduleMap]', error)
      setMapError(error)
      setIsLoading(false)
    }

    document.head.appendChild(script)

    // Do NOT remove script on unmount - keep it as singleton
  }, [])

  // Initialize map (only when API, container, and dimensions are ready)
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current || googleMapRef.current) return

    // Check container dimensions
    const container = mapRef.current
    const containerWidth = container.offsetWidth
    const containerHeight = container.offsetHeight

    if (containerWidth === 0 || containerHeight === 0) {
      // Container not ready yet, will retry via ResizeObserver
      return
    }

    // Verify API is actually ready before accessing MapTypeId
    if (!isGoogleMapsReady()) {
      console.error('[ScheduleMap] Google Maps API not ready during map initialization')
      setMapError('Google Maps API not ready')
      setIsLoading(false)
      return
    }

    try {
      const initialMapTypeId = mapType === 'satellite'
        ? (window as any).google.maps.MapTypeId.HYBRID
        : (window as any).google.maps.MapTypeId.ROADMAP

      const map = new (window as any).google.maps.Map(container, {
        center: { lat: 39.8283, lng: -98.5795 }, // Default to US center
        zoom: 4,
        mapTypeId: initialMapTypeId,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      })

      // Log map instance creation
      mapInstanceCounter++
      mapInstanceIdRef.current = `map-${mapInstanceCounter}-${Date.now()}`
      console.log('[SCHEDULE_MAP_INSTANCE_CREATED]', { id: mapInstanceIdRef.current, timestamp: Date.now() })

      // Track user interaction with the map (only genuine user input, not programmatic changes)
      map.addListener('dragstart', () => {
        logCameraState('dragstart', 'user_drag_start')
        if (!programmaticCameraChangeRef.current) {
          userInteractedRef.current = true
          setLastAutoFitDateKey(null)
        }
      })

      // High-frequency diagnostic listeners - only register if diagnostics enabled
      if (enableHighFrequencyDiagnostics.current) {
        map.addListener('drag', () => {
          logThrottled('drag', () => logCameraState('drag', 'user_dragging'))
        })

        map.addListener('dragend', () => {
          logCameraState('dragend', 'user_drag_end')
        })

        map.addListener('zoom_changed', () => {
          logThrottled('zoom_changed', () => logCameraState('zoom_changed', 'user_zoom'))
        })

        map.addListener('center_changed', () => {
          logThrottled('center_changed', () => logCameraState('center_changed', 'user_pan'))
        })

        map.addListener('bounds_changed', () => {
          logThrottled('bounds_changed', () => logCameraState('bounds_changed', 'viewport_change'))
        })
      }

      // idle fires after any movement settles (user or programmatic)
      // Event-driven guard: consume pending programmatic move on idle
      map.addListener('idle', () => {
        logCameraState('idle', 'movement_settled')
        if (pendingProgrammaticMoveRef.current) {
          pendingProgrammaticMoveRef.current = false
          programmaticCameraChangeRef.current = false
        } else if (!programmaticCameraChangeRef.current) {
          userInteractedRef.current = true
          setLastAutoFitDateKey(null)
        }
      })

      googleMapRef.current = map
      setMapReady(true)
    } catch (error) {
      console.error('[ScheduleMap] Failed to initialize map:', error)
      setMapError('Failed to initialize Google Maps')
      setIsLoading(false)
    }
  }, [isMapLoaded, mapType, logCameraState, logThrottled])

  // ResizeObserver to initialize map when container gets dimensions
  useEffect(() => {
    if (googleMapRef.current || !isMapLoaded || !mapRef.current) return

    const container = mapRef.current
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0 && !googleMapRef.current) {
          resizeObserver.disconnect()
          // Trigger map initialization by setting a dummy state
          setMapReady(false) // Will trigger the init effect again
          setTimeout(() => setMapReady(true), 0)
        }
      }
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [isMapLoaded])

  // ResizeObserver to monitor container size changes after map is initialized
  useEffect(() => {
    if (!mapReady || !mapRef.current || !googleMapRef.current) return

    const container = mapRef.current

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const lastSize = resizeLastSizeRef.current || { width: 0, height: 0 }

        // Only log if size actually changed (avoid noise)
        if (Math.abs(width - lastSize.width) > 1 || Math.abs(height - lastSize.height) > 1) {
          console.log('[SCHEDULE_MAP_RESIZE]', {
            old: `${lastSize.width}x${lastSize.height}`,
            new: `${width}x${height}`,
            reason: 'container_resize',
            mapInstance: mapInstanceIdRef.current,
            userInteracted: userInteractedRef.current,
            timestamp: Date.now()
          })
          resizeLastSizeRef.current = { width, height }
        }
      }
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [mapReady])

  // Save per-date state before date change
  useEffect(() => {
    const dateKey = selectedDate.toISOString().split('T')[0]
    if (previousDateKey && previousDateKey !== dateKey) {
      const state = perDateStateRef.current.get(previousDateKey) || {
        selectedMapItemId: null,
        filter: 'all',
        center: null,
        zoom: null,
        userInteracted: false
      }

      // Save current viewport if map exists and user has interacted
      if (googleMapRef.current && userInteractedRef.current) {
        const center = googleMapRef.current.getCenter()
        const zoom = googleMapRef.current.getZoom()
        state.center = { lat: center.lat(), lng: center.lng() }
        state.zoom = zoom
      }

      // Only save if state actually changed
      if (
        state.selectedMapItemId !== selectedMapItemId ||
        state.filter !== mapFilter ||
        state.userInteracted !== userInteractedRef.current
      ) {
        state.selectedMapItemId = selectedMapItemId
        state.filter = mapFilter
        state.userInteracted = userInteractedRef.current
        perDateStateRef.current.set(previousDateKey, state)
      }
    }
    setPreviousDateKey(dateKey)
  }, [selectedDate, selectedMapItemId, mapFilter, previousDateKey])

  // Restore per-date state when date changes
  useEffect(() => {
    const dateKey = selectedDate.toISOString().split('T')[0]
    const savedState = perDateStateRef.current.get(dateKey)

    console.log('[SCHEDULE_MAP_STATE_RESTORE]', {
      dateKey,
      hasSavedState: !!savedState,
      mapReady,
      mapInstance: mapInstanceIdRef.current,
      userInteracted: userInteractedRef.current
    })

    if (savedState) {
      setSelectedMapItemId(savedState.selectedMapItemId)
      setMapFilter(savedState.filter)
      // Only restore userInteracted if it's true (user had manually moved the map)
      // Don't reset it to false if user has already interacted in current session
      if (savedState.userInteracted) {
        userInteractedRef.current = true
      }

      // Restore viewport immediately if map is ready and saved viewport exists
      // This prevents race condition with marker rendering effect
      // IMPORTANT: Only restore if user is NOT currently interacting
      if (mapReady && googleMapRef.current && savedState.center && savedState.zoom && !userInteractedRef.current) {
        // Check if this is actually a camera change (avoid no-op calls)
        const currentCenter = googleMapRef.current.getCenter()
        const currentZoom = googleMapRef.current.getZoom()
        const currentLat = currentCenter.lat()
        const currentLng = currentCenter.lng()
        const savedLat = savedState.center.lat
        const savedLng = savedState.center.lng
        const isSameCenter = Math.abs(currentLat - savedLat) < 0.000001 &&
                             Math.abs(currentLng - savedLng) < 0.000001
        const isSameZoom = Math.abs(currentZoom - savedState.zoom) < 0.01

        if (!isSameCenter || !isSameZoom) {
          logCameraCommand('date_state_restoration', 'setCenter+setZoom', {
            center: savedState.center,
            zoom: savedState.zoom,
            reason: 'restore_saved_viewport'
          })
          programmaticCameraChangeRef.current = true
          pendingProgrammaticMoveRef.current = true
          googleMapRef.current.setCenter(savedState.center)
          googleMapRef.current.setZoom(savedState.zoom)
        }
      }
    } else {
      // First visit - prioritize business location, then markers, then fallback
      setShowAllMode(true)
      userInteractedRef.current = false

      // Try to center on business location first
      if (mapReady && googleMapRef.current && businessCoordsCacheRef.current) {
        const { lat, lng } = businessCoordsCacheRef.current
        logCameraCommand('first_visit_business_center', 'setCenter', {
          center: `${lat},${lng}`,
          zoom: 13,
          reason: 'first_visit_business_location'
        })
        programmaticCameraChangeRef.current = true
        pendingProgrammaticMoveRef.current = true
        googleMapRef.current.setCenter({ lat, lng })
        googleMapRef.current.setZoom(13)
      }
      // If no business location yet, the marker update effect will handle auto-fit when markers arrive
    }

    setSelectedMarker(null)
  }, [selectedDate, mapReady, logCameraCommand])

  // Prepare map items when date changes or business geocoding completes (with race condition guard)
  useEffect(() => {
    const preparationId = ++mapPreparationIdRef.current
    const dateKey = selectedDate.toISOString().split('T')[0]

    let isCancelled = false

    const prepare = async () => {
      // Do NOT set isLoading to true - keep map visible during data preparation
      await prepareMapItems(preparationId)

      // Check if this result is still relevant
      const currentDateKey = selectedDate.toISOString().split('T')[0]
      if (dateKey !== currentDateKey || isCancelled) {
        return
      }
    }

    prepare()

    return () => {
      isCancelled = true
    }
  }, [prepareMapItems, selectedDate, businessGeocodeTrigger])

  // Update markers when map items change or map becomes ready
  useEffect(() => {
    if (!mapReady || !googleMapRef.current) {
      return
    }

    const filteredItems = getFilteredMapItems(mapItems)

    // Create canonical stop-number lookup based on chronological order
    const sortedWithStopNumbers = [...filteredItems]
      .sort((a, b) => {
        const timeA = a.scheduledTime || '00:00'
        const timeB = b.scheduledTime || '00:00'
        const timeCompare = timeA.localeCompare(timeB)
        if (timeCompare !== 0) return timeCompare
        // Stable tie-breaker: use item ID for identical times
        return a.id.localeCompare(b.id)
      })
      .map((item, index) => ({ ...item, stopNumber: index + 1 }))

    const stopNumberLookup = new Map<string, number>()
    sortedWithStopNumbers.forEach(item => {
      stopNumberLookup.set(item.id, item.stopNumber!)
    })

    // Group items by location
    const markerInfos = groupItemsByLocation(filteredItems)

    // Track current marker IDs
    const currentMarkerIds = new Set<string>()

    // Create or update markers
    markerInfos.forEach(markerInfo => {
      const primaryItem = markerInfo.items[0]
      const markerKey = primaryItem.id // Use item ID as marker key
      currentMarkerIds.add(markerKey)

      const isSelected = selectedMapItemId !== null && markerInfo.items.some(item => item.id === selectedMapItemId)
      const stopNumber = stopNumberLookup.get(primaryItem.id) || 1
      const isBusinessMarker = primaryItem.type === 'business'

      // Check if marker already exists
      const existingMarker = markersRef.current.get(markerKey)

      if (existingMarker) {
        // Update existing marker
        existingMarker.setIcon(createNumberedMarkerIcon(stopNumber, primaryItem.type, isSelected))
        existingMarker.setZIndex(isSelected ? 1000 : 1)
      } else {
        // Create new marker
        const marker = new (window as any).google.maps.Marker({
          position: markerInfo.position,
          map: googleMapRef.current,
          title: isBusinessMarker
            ? `${primaryItem.title} (Business location)`
            : markerInfo.items.length === 1
              ? `Stop ${stopNumber}: ${primaryItem.title}`
              : `${markerInfo.items.length} stops at this location`,
          icon: createNumberedMarkerIcon(stopNumber, primaryItem.type, isSelected),
          zIndex: isSelected ? 1000 : 1
        })

        marker.addListener('click', () => {
          if (markerInfo.items.length === 1) {
            selectMapItem(markerInfo.items[0].id)
          } else {
            setSelectedMarker(markerInfo)
          }
        })

        markersRef.current.set(markerKey, marker)
      }
    })

    // Remove markers that no longer exist
    markersRef.current.forEach((marker, key) => {
      if (!currentMarkerIds.has(key)) {
        marker.setMap(null)
        markersRef.current.delete(key)
      }
    })

    // Log marker lifecycle
    const createdCount = currentMarkerIds.size - markersRef.current.size
    const removedCount = markersRef.current.size - currentMarkerIds.size
    console.log('[SCHEDULE_MAP_MARKERS]', {
      created: createdCount,
      removed: removedCount,
      total: currentMarkerIds.size,
      reason: 'marker_update_effect',
      mapInstance: mapInstanceIdRef.current
    })

    // Create signature from sorted marker IDs and mapItems coordinates (not Google Maps marker positions)
    // This prevents signature changes due to floating-point precision differences in Google Maps marker positions
    const sortedMarkerIds = Array.from(currentMarkerIds).sort()
    const signature = sortedMarkerIds.map(id => {
      const item = filteredItems.find(i => i.id === id)
      if (!item) return ''
      return `${id}:${item.latitude.toFixed(6)},${item.longitude.toFixed(6)}`
    }).join('|')

    // Check if a new appointment marker was added (transition from unmappable to mappable)
    const previousSignature = markerSetSignatureRef.current
    const signatureChanged = signature !== previousSignature
    let hasNewAppointmentMarker = false
    
    if (signatureChanged && previousSignature) {
      // Check if any appointment IDs are in the new signature but not in the old one
      const previousIds = new Set(previousSignature.split('|').map(s => s.split(':')[0]))
      const newAppointmentIds = sortedMarkerIds.filter(id => 
        id.startsWith('appointment:') && !previousIds.has(id)
      )
      if (newAppointmentIds.length > 0) {
        hasNewAppointmentMarker = true
        newlyMappableEventIdRef.current = newAppointmentIds[0]
      }
    }

    // Get bottom nav height from CSS variable for padding
    const bottomNavHeight = typeof window !== 'undefined'
      ? parseInt(getComputedStyle(document.body).getPropertyValue('--bottom-nav-height')) || 80
      : 80
    const bottomPadding = bottomNavHeight + 40 // Add extra breathing room

    // Get current date key for auto-fit logic (use local timezone)
    const currentDateKey = selectedDate.toLocaleDateString('en-CA')
    const dateChanged = previousDateKey !== null && previousDateKey !== currentDateKey

    // Reset initial camera flag on date change to allow new fit for new date
    if (dateChanged) {
      initialCameraEstablishedRef.current = false
    }

    // Reset initial camera flag on filter change to allow new fit for new filter
    const filterChanged = previousMapFilterRef.current !== mapFilter
    if (filterChanged) {
      initialCameraEstablishedRef.current = false
      previousMapFilterRef.current = mapFilter
    }

    // Smart automatic framing logic
    console.log('[SCHEDULE_MAP_EFFECT]', {
      effect: 'marker_update_auto_fit_check',
      markersCount: markersRef.current.size,
      showAllMode,
      userInteracted: userInteractedRef.current,
      dateChanged,
      signatureChanged,
      initialCameraEstablished: initialCameraEstablishedRef.current,
      lastAutoFitDateKey
    })

    if (markersRef.current.size === 0) {
      markerSetSignatureRef.current = signature
      setLastAutoFitDateKey(null)
    } else if (selectedMapItemId && !userInteractedRef.current) {
      const selectedMarker = markersRef.current.get(selectedMapItemId)
      if (selectedMarker) {
        const pos = selectedMarker.getPosition()
        panToMarker(pos.lat(), pos.lng(), 15, false, 'selected_item')
        markerSetSignatureRef.current = signature
      }
    } else if (showAllMode && !userInteractedRef.current && (dateChanged || signatureChanged)) {
      const shouldAutoFit = dateChanged || filterChanged || (signatureChanged && !initialCameraEstablishedRef.current)

      console.log('[SCHEDULE_MAP_EFFECT]', {
        effect: 'auto_fit_decision',
        shouldAutoFit,
        dateChanged,
        filterChanged,
        signatureChanged,
        initialCameraEstablished: initialCameraEstablishedRef.current,
        lastAutoFitDateKey,
        currentDateKey
      })

      if (shouldAutoFit) {
        markerSetSignatureRef.current = signature
        setLastAutoFitDateKey(currentDateKey)
        initialCameraEstablishedRef.current = true

        if (markersRef.current.size === 1) {
          const singleMarker = markersRef.current.values().next().value
          if (singleMarker) {
            const pos = singleMarker.getPosition()
            panToMarker(pos.lat(), pos.lng(), 13, false, 'single_marker_initial')
          }
        } else {
          const bounds = new (window as any).google.maps.LatLngBounds()
          markersRef.current.forEach(marker => {
            bounds.extend(marker.getPosition()!)
          })
          fitBoundsWithMaxZoom(bounds, 15, bottomPadding, 'multi_marker_initial')
        }
      } else {
        markerSetSignatureRef.current = signature
      }
    } else if (!showAllMode || userInteractedRef.current) {
      console.log('[SCHEDULE_MAP_EFFECT]', {
        effect: 'skip_auto_fit',
        reason: !showAllMode ? 'not_show_all_mode' : 'user_interacted',
        showAllMode,
        userInteracted: userInteractedRef.current
      })
      markerSetSignatureRef.current = signature
    }

    return () => {
      // Clean up all markers on unmount
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current.clear()
    }
  }, [mapItems, groupItemsByLocation, mapReady, getFilteredMapItems, showAllMode, fitBoundsWithMaxZoom, selectMapItem, selectedMapItemId, previousDateKey, lastAutoFitDateKey, mapFilter])

  // Update marker icons when selection changes (without triggering camera changes)
  useEffect(() => {
    if (!mapReady) return

    // Create stopNumber lookup for current filter state
    const filteredItems = getFilteredMapItems(mapItems)
    const sortedWithStopNumbers = [...filteredItems]
      .sort((a, b) => {
        const timeA = a.scheduledTime || '00:00'
        const timeB = b.scheduledTime || '00:00'
        const timeCompare = timeA.localeCompare(timeB)
        if (timeCompare !== 0) return timeCompare
        return a.id.localeCompare(b.id)
      })
      .map((item, index) => ({ ...item, stopNumber: index + 1 }))

    const stopNumberLookup = new Map<string, number>()
    sortedWithStopNumbers.forEach(item => {
      stopNumberLookup.set(item.id, item.stopNumber!)
    })

    markersRef.current.forEach((marker, key) => {
      // Check if this marker corresponds to the selected item
      const isSelected = selectedMapItemId !== null && key === selectedMapItemId
      const currentIcon = marker.getIcon()

      // Only update if selection state actually changed
      // We can detect this by checking the icon size (selected = 44, unselected = 36)
      const currentSize = currentIcon?.size || 36
      const targetSize = isSelected ? 44 : 36

      if (currentSize !== targetSize) {
        // Use stopNumber lookup instead of parsing title
        const stopNumber = stopNumberLookup.get(key) || 1

        // Extract type from marker key
        const type = key.startsWith('appointment:') ? 'appointment' : 'job'

        marker.setIcon(createNumberedMarkerIcon(stopNumber, type, isSelected))
        marker.setZIndex(isSelected ? 1000 : 1)
      }
    })
  }, [selectedMapItemId, mapReady, getFilteredMapItems, mapItems])

  // Log map instance destruction on unmount
  useEffect(() => {
    return () => {
      if (googleMapRef.current) {
        console.log('[SCHEDULE_MAP_INSTANCE_DESTROYED]', {
          id: mapInstanceIdRef.current,
          timestamp: Date.now()
        })
      }
    }
  }, [])

  // Create numbered marker icon
  const createNumberedMarkerIcon = (stopNumber: number, type: MapItemType, isSelected: boolean = false): any => {
    // Cache key based on all inputs that affect visual output
    const cacheKey = `${stopNumber}-${type}-${isSelected}`

    // Return cached icon if available
    if (markerIconCache.has(cacheKey)) {
      return markerIconCache.get(cacheKey)
    }

    const isBusiness = type === 'business'
    const color = isBusiness ? '#10B981' : type === 'job' ? '#8B5CF6' : '#3B82F6' // Green for business, purple for jobs, blue for appointments
    const size = isSelected ? 44 : 36
    const strokeWidth = isSelected ? 4 : 2
    const textColor = '#FFFFFF'

    // Create canvas for numbered marker
    const canvas = document.createElement('canvas')
    const scale = 2 // Retina display support
    canvas.width = size * scale
    canvas.height = size * scale
    const ctx = canvas.getContext('2d')!
    ctx.scale(scale, scale)

    // Draw circle background
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - strokeWidth / 2, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = isSelected ? '#F59E0B' : '#FFFFFF'
    ctx.lineWidth = strokeWidth
    ctx.stroke()

    // Draw number or business icon
    ctx.fillStyle = textColor
    ctx.font = `bold ${size * 0.4}px system-ui, -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (isBusiness) {
      ctx.fillText('🏠', size / 2, size / 2)
    } else {
      ctx.fillText(stopNumber.toString(), size / 2, size / 2)
    }

    const icon = {
      url: canvas.toDataURL(),
      scaledSize: new (window as any).google.maps.Size(size, size),
      anchor: new (window as any).google.maps.Point(size / 2, size / 2)
    }

    // Cache the icon
    markerIconCache.set(cacheKey, icon)

    return icon
  }

  // Handle marker info card actions
  const handleViewItem = (item: MapItem) => {
    if (item.type === 'job' && item.jobId) {
      onViewJob(item.jobId)
    } else if (item.leadId) {
      onViewCustomer(item.leadId)
    }
    setSelectedMarker(null)
  }

  // Loading state - only show skeleton if Google Maps itself is not loaded
  if (!isMapLoaded && !mapError) {
    return (
      <div className="flex flex-col h-full">
        {/* Date Navigation Header */}
        <div className="flex items-center justify-between mb-4 px-1">
          <button
            onClick={onPreviousDay}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
              {formatDate(selectedDate)}
            </h2>
          </div>
          <button
            onClick={onNextDay}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Map Skeleton */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden">
          <Skeleton className="w-full h-full" />
        </div>
      </div>
    )
  }

  // Error state
  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4 px-1">
          <button onClick={onPreviousDay} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold">{formatDate(selectedDate)}</h2>
          <button onClick={onNextDay} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<AlertCircle className="w-12 h-12" />}
            title="Google Maps not configured"
            description="Google Maps API key is required to display the map view."
          />
        </div>
      </div>
    )
  }

  
  const filteredItems = getFilteredMapItems(mapItems)
  const sortedItems = getSortedMappedItems(filteredItems)
  const selectedItem = selectedMapItemId ? sortedItems.find(i => i.id === selectedMapItemId) : null
  
  // Calculate route summary
  const mappedStopsCount = sortedItems.length
  const firstStop = sortedItems[0]
  const lastStop = sortedItems[sortedItems.length - 1]
  const routeSummary = mappedStopsCount > 0
    ? `${mappedStopsCount} stop${mappedStopsCount > 1 ? 's' : ''}${firstStop?.scheduledTime && lastStop?.scheduledTime ? ` · ${formatTime(firstStop.scheduledTime)} – ${formatTime(lastStop.scheduledTime)}` : ''}`
    : 'No mapped stops'

  return (
    <div className="flex flex-col h-full relative">
      {/* Date Navigation Header - Compact on mobile */}
      <div className="flex items-center justify-between mb-2 md:mb-4 px-1 z-10">
        <button
          onClick={onPreviousDay}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Previous day"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div className="text-center flex-1 flex flex-col items-center">
          <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-foreground">
            {formatDate(selectedDate)}
          </h2>
          <button
            onClick={onGoToToday}
            className="mt-1 md:hidden px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            Today
          </button>
        </div>
        <button
          onClick={onNextDay}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Next day"
        >
          <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Desktop Today button - hidden on mobile */}
      <div className="hidden md:flex justify-center mb-4 z-10">
        <button
          onClick={onGoToToday}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
        >
          Today
        </button>
      </div>

      {/* Filter and Show All Controls - Compact on mobile */}
      <div className="flex items-center justify-between mb-2 md:mb-4 px-1 z-10">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 md:p-1">
            <button
              onClick={() => { setMapFilter('all') }}
              className={`px-2 md:px-3 py-1 md:py-1 text-xs font-medium rounded-md transition-colors ${
                mapFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
              }`}
            >
              All
            </button>
            <button
              onClick={() => { setMapFilter('jobs') }}
              className={`px-2 md:px-3 py-1 md:py-1 text-xs font-medium rounded-md transition-colors ${
                mapFilter === 'jobs'
                  ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
              }`}
            >
              Jobs
            </button>
            <button
              onClick={() => { setMapFilter('appointments') }}
              className={`px-2 md:px-3 py-1 md:py-1 text-xs font-medium rounded-md transition-colors ${
                mapFilter === 'appointments'
                  ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
              }`}
            >
              Appointments
            </button>
          </div>
        </div>
        {sortedItems.length > 0 && (
          <button
            onClick={showAllMarkers}
            className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Show All Stops</span>
            <span className="md:hidden">All</span>
          </button>
        )}
      </div>

      {/* Selected-Day Item List (All items: jobs, appointments, tasks) - Compact on mobile */}
      <div className="mb-2 md:mb-4 z-10">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-3 md:px-4 py-2 md:py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-foreground">Today's Schedule</h3>
          </div>
          <div>
            {(() => {
              const selectedDayItems = getSelectedDayItems()
              if (selectedDayItems.length === 0) {
                return (
                  <div className="px-4 py-6 md:py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No items scheduled for this day
                  </div>
                )
              }
              return selectedDayItems.map((item) => {
                const isSelected = selectedListItem?.id === item.id
                const isMappable = item.hasLocation && item.latitude !== null && item.longitude !== null

                const handleItemClick = () => {
                  setSelectedListItem(item)
                  if (isMappable) {
                    // Determine the map item ID based on type
                    const mapItemId = item.type === 'job' && item.jobId
                      ? item.jobId
                      : item.type === 'appointment' && item.eventId
                      ? `appointment:${item.eventId}`
                      : null

                    if (mapItemId) {
                      selectMapItem(mapItemId)
                    }
                  }
                }

                const handleEditClick = (e: React.MouseEvent) => {
                  e.stopPropagation()
                  if (item.type === 'job' && onEditJob) {
                    const job = jobs.find(j => j.id === item.jobId)
                    if (job) onEditJob(job)
                  } else if (item.type === 'task' && onEditTask) {
                    const task = tasks.find(t => t.id === item.taskId)
                    if (task) onEditTask(task)
                  } else if (item.type === 'appointment' && onEditEvent) {
                    const event = calendarEvents.find(e => e.id === item.eventId)
                    if (event) onEditEvent(event)
                  }
                }

                const handleAddLocationClick = (e: React.MouseEvent) => {
                  e.stopPropagation()
                  if (item.type === 'job' && onAddLocationJob) {
                    const job = jobs.find(j => j.id === item.jobId)
                    if (job) onAddLocationJob(job)
                  } else if (item.type === 'appointment' && onAddLocationEvent) {
                    const event = calendarEvents.find(e => e.id === item.eventId)
                    if (event) onAddLocationEvent(event)
                  }
                }

                const formatItemTime = (time: string | null) => {
                  if (!time) return 'No time'
                  const [hours, minutes] = time.split(':')
                  const hour = parseInt(hours, 10)
                  const ampm = hour >= 12 ? 'PM' : 'AM'
                  const hour12 = hour % 12 || 12
                  return `${hour12}:${minutes} ${ampm}`
                }

                const getItemIcon = () => {
                  if (item.type === 'job') return <Briefcase className="w-4 h-4" />
                  if (item.type === 'appointment') return <Calendar className="w-4 h-4" />
                  return <AlertCircle className="w-4 h-4" />
                }

                const getItemColor = () => {
                  if (item.type === 'job') return 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  if (item.type === 'appointment') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  return 'bg-slate-100 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400'
                }

                const getTypeLabel = () => {
                  if (item.type === 'job') return 'Job'
                  if (item.type === 'appointment') return 'Appointment'
                  if (item.type === 'task') return 'Task'
                  return ''
                }

                const getTypeLabelColor = () => {
                  if (item.type === 'job') return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  if (item.type === 'appointment') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  if (item.type === 'task') return 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300'
                  return 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300'
                }

                return (
                  <button
                    key={item.id}
                    onClick={handleItemClick}
                    className={`w-full px-3 md:px-4 py-2 md:py-3 flex items-start gap-2 md:gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0 ${
                      isSelected ? 'bg-slate-50 dark:bg-slate-700/50' : ''
                    } ${isMappable ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getItemColor()}`}>
                      {getItemIcon()}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5 md:gap-2 mb-0.5 md:mb-1">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {formatItemTime(item.scheduledTime)}
                        </p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getTypeLabelColor()}`}>
                          {getTypeLabel()}
                        </span>
                        {!item.hasLocation && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            No location
                          </span>
                        )}
                      </div>
                      <p className="text-xs md:text-sm font-medium text-foreground truncate">
                        {item.title}
                      </p>
                      {item.customerName && (
                        <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 truncate hidden md:block">
                          {item.customerName}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {!item.hasLocation && item.type !== 'task' && (
                        <button
                          onClick={handleAddLocationClick}
                          className="text-[10px] px-1.5 py-0.5 md:px-2 md:py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          Add
                        </button>
                      )}
                      {item.hasLocation && (
                        <button
                          onClick={handleEditClick}
                          className="text-[10px] px-1.5 py-0.5 md:px-2 md:py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      {item.type === 'task' && (
                        <button
                          onClick={handleEditClick}
                          className="text-[10px] px-1.5 py-0.5 md:px-2 md:py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </button>
                )
              })
            })()}
          </div>
        </div>
      </div>

      {/* Mobile Horizontal Stop Cards - Removed on mobile to save space, map markers provide stop navigation */}
      {sortedItems.length > 0 && (
        <div className="hidden md:block mb-4 z-10">
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-sm font-semibold text-foreground">Today's Stops</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{routeSummary}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" id="mobile-stop-cards">
            {sortedItems.map((item) => (
              <button
                key={item.id}
                ref={selectedMapItemId === item.id ? (el: any) => {
                  if (el) {
                    setTimeout(() => {
                      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                    }, 100)
                  }
                } : null}
                onClick={() => selectMapItem(item.id)}
                className={`flex-shrink-0 px-3 py-2 rounded-lg border transition-colors ${
                  selectedMapItemId === item.id
                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 ring-2 ring-purple-300 dark:ring-purple-700'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs ${
                    item.type === 'job' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>
                    {item.stopNumber}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-medium text-foreground truncate max-w-[100px]">
                      {item.scheduledTime ? formatTime(item.scheduledTime) : 'No time'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[100px]">
                      {item.customerName || 'No customer'}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map Container - Increased height on mobile with bottom padding for nav */}
      <div className="flex-1 min-h-[50vh] md:min-h-0 relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div ref={mapRef} className="w-full h-full" style={{ paddingBottom: 'var(--bottom-nav-height, 80px)' }} />
        
        {/* Map Controls Stack */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
          {/* Map Type Toggle */}
          <div className="flex bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setMapType('roadmap')}
              className={`px-3 py-2 text-xs font-medium transition-colors min-w-[60px] ${
                mapType === 'roadmap'
                  ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setMapType('satellite')}
              className={`px-3 py-2 text-xs font-medium transition-colors min-w-[60px] ${
                mapType === 'satellite'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              Satellite
            </button>
          </div>
        </div>
        
        {/* Selected Item Info Card */}
        {selectedItem && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 z-20">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                  selectedItem.type === 'job' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                }`}>
                  {selectedItem.stopNumber}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Stop {selectedItem.stopNumber} · {selectedItem.scheduledTime ? formatTime(selectedItem.scheduledTime) : 'No time'}
                  </p>
                  <h3 className="font-semibold text-slate-900 dark:text-foreground">{selectedItem.customerName || 'No customer'}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedMapItemId(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-500 mb-2">
              {selectedItem.address}
            </p>

            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                selectedItem.type === 'job' 
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' 
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              }`}>
                {selectedItem.type === 'job' ? 'Job' : 'Appointment'}
              </span>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate flex-1">
                {selectedItem.title}
              </p>
            </div>

            {/* Next/Previous Navigation */}
            {sortedItems.length > 1 && (
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => navigateToStop('previous')}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Previous
                </button>
                <button
                  onClick={() => navigateToStop('next')}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                >
                  Next
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}

            <button
              onClick={() => handleViewItem(selectedItem)}
              className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              View Details
            </button>
          </div>
        )}

        {/* Legacy selected marker info card (for clustered items) */}
        {selectedMarker && !selectedItem && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 z-20">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-slate-900 dark:text-foreground">
                {selectedMarker.items.length} stops at this location
              </h3>
              <button
                onClick={() => setSelectedMarker(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectedMarker.items.map((item, index) => (
                <button
                  key={`${item.type}-${item.id}-${index}`}
                  onClick={() => selectMapItem(item.id)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 rounded-lg text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {item.type === 'job' ? (
                      <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    ) : (
                      <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {item.scheduledTime ? formatTime(item.scheduledTime) : 'No time'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const ScheduleMap = memo(ScheduleMapComponent)
export default ScheduleMap
