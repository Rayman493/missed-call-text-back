'use client'

import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react'
import { MapPin, Calendar, Briefcase, AlertCircle, ChevronLeft, ChevronRight, Filter, ArrowLeft, ArrowRight, Layers, Crosshair, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { isValidCoordinate } from '@/lib/map-utils'
import { formatEventTimeRange, formatTime12Hour } from '@/lib/calendar-date-utils'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

// Helper to format time range from HH:MM format strings
function formatTimeRangeHHMM(startTime: string | null, endTime: string | null): string {
  const formattedStart = formatTime12Hour(startTime)
  if (!endTime) {
    return formattedStart
  }
  const formattedEnd = formatTime12Hour(endTime)
  return `${formattedStart} – ${formattedEnd}`
}

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

interface MapItem {
  id: string
  type: MapItemType
  title: string
  customerName: string | null
  customerPhone: string | null
  address: string
  scheduledDate: string | null
  scheduledTime: string | null
  scheduledEndTime: string | null
  status: string | null
  leadId: string | null
  jobId: string | null
  taskId: string | null
  eventId: string | null
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
  const lastLogTimeRef = useRef<{ [key: string]: number }>({}) // For throttling high-frequency events
  const isUnmountingRef = useRef(false) // Track if component is unmounting to prevent clearing map ref on effect rerun
  const gestureRenderCountRef = useRef(0) // Track renders during active gesture for performance measurement
  const markersRef = useRef<Map<string, any>>(new Map()) // Marker registry keyed by item ID

// Operation counters for gesture performance measurement
const opCountersRef = useRef({
  mapCreate: 0,
  markerCreate: 0,
  markerSetMap: 0,
  markerSetIcon: 0,
  markerSetPosition: 0,
  mapSetCenter: 0,
  mapPanTo: 0,
  mapFitBounds: 0,
  mapSetZoom: 0,
  mapSetOptions: 0,
  markerCleanup: 0
})

// Track operation timestamps for gesture analysis
const opTimestampsRef = useRef<Array<{ operation: string; timestamp: number; duringGesture: boolean }>>([])

// Helper to log operation with gesture context
function logOperation(operation: string) {
  const timestamp = Date.now()
  const duringGesture = activeGestureRef.current
  opTimestampsRef.current.push({ operation, timestamp, duringGesture })
  if (duringGesture) {
    console.warn(`[SCHEDULE_MAP_OP_DURING_GESTURE]`, { operation, timestamp, mapInstance: mapInstanceIdRef.current })
  }
}
  const calendarEventCoordsCacheRef = useRef<Map<string, { lat: number; lng: number; formattedAddress: string } | null>>(new Map()) // Cache for calendar event coordinates (null = failed geocode)
  const businessCoordsCacheRef = useRef<{ lat: number; lng: number; formattedAddress: string } | null>(null) // Cache for business coordinates
  const lastBusinessAddressRef = useRef<string | null>(null) // Track last business address for invalidation
  const businessGeocodingInProgressRef = useRef(false) // Track if business geocoding is in progress for current date
  const mapPreparationIdRef = useRef(0) // Monotonically increasing ID to prevent stale async results

  // Simple camera model refs
  const semanticContextKeyRef = useRef<string>('') // stores current context key
  const userInteractedForContextRef = useRef(false) // tracks if user manually interacted
  const framedSignatureForContextRef = useRef('') // tracks framed marker set signature
  const correctiveFrameUsedForContextRef = useRef(false) // tracks if corrective frame used
  const programmaticMoveInProgressRef = useRef(false) // tracks programmatic camera moves
  const activeGestureRef = useRef(false) // tracks if a manual gesture (drag/zoom) is currently active

  // Stop color palette - distinct colors for each stop number (colorblind-accessible)
  const STOP_COLOR_PALETTE = [
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#3B82F6', // Blue
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
  ]
  // Constants for viewport behavior
const HOME_BASE_ONLY_ZOOM = 13 // Local zoom for single marker (shows ~5-10 miles)
const MULTI_MARKER_MAX_ZOOM = 14 // Max zoom for multi-marker fit bounds (reduced from 15 to prevent excessive zoom-in when points are close)

// Responsive padding for fitBounds (accounts for UI elements on different screen sizes)
const getResponsivePadding = useCallback(() => {
  if (typeof window === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }

  const isMobile = window.innerWidth < 768
  const bottomNavHeight = parseInt(getComputedStyle(document.body).getPropertyValue('--bottom-nav-height')) || 80

  if (isMobile) {
    // Mobile: account for top header, Today's Schedule panel, bottom nav, map controls
    // Use balanced padding to avoid excessive zoom-out while keeping UI visible
    return {
      top: 80, // Header + reasonable cushion
      right: 20, // Right edge cushion for map controls
      bottom: bottomNavHeight + 30, // Bottom nav + breathing room
      left: 20 // Left edge cushion
    }
  } else {
    // Desktop: more breathing room, less UI obstruction
    return {
      top: 60, // Header
      right: 40, // Right cushion
      bottom: 40, // Bottom cushion
      left: 40 // Left cushion
    }
  }
}, [])

const previousMapFilterRef = useRef<MapFilter>('all') // Track previous filter to detect changes
  const resizeLastSizeRef = useRef<{ width: number; height: number } | null>(null) // Move ref to top level
  const autoSelectDateRef = useRef<string | null>(null) // Track date for which we've auto-selected Stop 1
  const userClosedDateRef = useRef<string | null>(null) // Track date where user explicitly closed the card
  const [businessGeocodeTrigger, setBusinessGeocodeTrigger] = useState(0) // Counter to trigger map items refresh when business geocoding completes
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)
  const [selectedMarker, setSelectedMarker] = useState<MarkerInfo | null>(null)
  const [selectedMapItemId, setSelectedMapItemId] = useState<string | null>(null)
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

  const [showAllMode, setShowAllMode] = useState(true)
  const [leadCache, setLeadCache] = useState<Map<string, { name: string | null; phone: string | null }>>(new Map()) // Cache for lead data to avoid N+1 queries

  // Derive selectedListItem from selectedMapItemId and mapItems (prevents stale object risk)
  const selectedListItem = useMemo(() =>
    mapItems.find(item => item.id === selectedMapItemId) ?? null,
    [mapItems, selectedMapItemId]
  )

  // Increment render count
  renderCountRef.current++
  const renderTimestamp = Date.now()
  // Track renders during active gesture for performance measurement
  if (activeGestureRef.current) {
    gestureRenderCountRef.current++
    const renderDuringGesture = {
      timestamp: renderTimestamp,
      mapInstance: mapInstanceIdRef.current,
      renderCount: renderCountRef.current
    }
    console.warn('[SCHEDULE_MAP_RENDER_DURING_GESTURE]', renderDuringGesture)
    opTimestampsRef.current.push({ operation: 'render', timestamp: renderTimestamp, duringGesture: true })
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
      businessGeocodingInProgressRef.current = false
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
      businessGeocodingInProgressRef.current = false
      return
    }

    // Check if address has changed
    if (lastBusinessAddressRef.current === businessAddress) {
      return
    }

    lastBusinessAddressRef.current = businessAddress
    businessGeocodingInProgressRef.current = true

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

        // Do NOT manually set camera here - let the marker update effect handle viewport
        // This prevents race conditions where camera is set before all markers are ready
        // The marker update effect will auto-fit when markers are added/changed

        // Trigger immediate map items refresh to show business marker
        // This fixes the timing issue where marker wouldn't appear until next date change
        setBusinessGeocodeTrigger(prev => prev + 1)
      } else {
        businessCoordsCacheRef.current = null
        console.log('[ScheduleMap] Business geocoding: success=false')
      }
      businessGeocodingInProgressRef.current = false
    }

    geocode()
  }, [business, formatBusinessAddress, geocodeBusinessAddress])

  // Format date for display - short format
  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // Format date for display - long format
  const formatDateLong = (date: Date) => {
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

  // Filter items for selected date
  const getItemsForDate = useCallback(() => {
    // Use local timezone to match database dates (YYYY-MM-DD format)
    const dateStr = selectedDate.toLocaleDateString('en-CA')

    const filteredJobs = jobs.filter(job => {
      if (!job.scheduled_date) return false
      return job.scheduled_date === dateStr
    })

    const filteredEvents = calendarEvents.filter(event => {
      const eventDateRaw = event.start.dateTime || event.start.date
      if (!eventDateRaw) return false

      // All-day events (date only, no time) - use string comparison
      if (!event.start.dateTime && event.start.date) {
        return event.start.date === dateStr
      }

      // Timed events - parse as Date to handle timezone correctly
      const eventDate = new Date(eventDateRaw)
      const eventDateStr = eventDate.toLocaleDateString('en-CA')
      return eventDateStr === dateStr
    })

    return { filteredJobs, filteredEvents }
  }, [jobs, calendarEvents, selectedDate])

  // Filter map items by type
  const getFilteredMapItems = useCallback((items: MapItem[]): MapItem[] => {
    if (mapFilter === 'all') return items
    return items.filter(item => item.type === mapFilter.slice(0, -1) as MapItemType)
  }, [mapFilter])

  // Clear selection if selected item is filtered out
  useEffect(() => {
    if (selectedMapItemId) {
      const filteredItems = getFilteredMapItems(mapItems)
      const isSelectedVisible = filteredItems.some(item => item.id === selectedMapItemId)
      if (!isSelectedVisible) {
        setSelectedMapItemId(null)
        setSelectedMarker(null) // Clear popup to prevent stale state
        setShowAllMode(true)
      }
    }
  }, [mapFilter, mapItems, selectedMapItemId, getFilteredMapItems])

  // Assign stop numbers to customer destinations only (Home Base/business does not consume a stop number)
  const assignStopNumbers = useCallback((items: MapItem[]): MapItem[] => {
    let customerStopIndex = 0
    return items.map(item => {
      if (item.type === 'business') {
        return { ...item, stopNumber: undefined }
      }
      customerStopIndex += 1
      return { ...item, stopNumber: customerStopIndex }
    })
  }, [])

  // Get sorted mapped items for navigation with stop numbering
  const getSortedMappedItems = useCallback((items: MapItem[]): MapItem[] => {
    const sorted = [...items].sort((a, b) => {
      const timeA = a.scheduledTime || '00:00'
      const timeB = b.scheduledTime || '00:00'
      return timeA.localeCompare(timeB)
    })
    return assignStopNumbers(sorted)
  }, [assignStopNumbers])

  // Fit bounds with max zoom constraint and responsive padding
  const fitBoundsWithMaxZoom = useCallback((bounds: any, maxZoom: number = 15, padding?: { top: number; right: number; bottom: number; left: number }, reason: string = 'unknown') => {
    if (!googleMapRef.current) return

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
      return
    }

    programmaticMoveInProgressRef.current = true

    // Apply responsive padding if specified, otherwise use default fitBounds
    if (padding) {
      googleMapRef.current.fitBounds(bounds, padding.top, padding.right, padding.bottom, padding.left)
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
  }, [])

  // Pan to marker without resetting bounds
  const panToMarker = useCallback((lat: number, lng: number, options?: { zoom?: number; setCameraOwnerToUser?: boolean; checkVisibility?: boolean }, reason: string = 'unknown') => {
    if (!googleMapRef.current) return

    const { zoom, setCameraOwnerToUser = false, checkVisibility = false } = options || {}

    // Check if marker is already comfortably visible (if requested)
    if (checkVisibility) {
      const bounds = googleMapRef.current.getBounds()
      const position = { lat, lng }
      if (bounds.contains(position)) {
        // Still update selection state without moving camera
        return
      }
    }

    // Check if this is actually a camera change (avoid no-op calls)
    const currentCenter = googleMapRef.current.getCenter()
    const currentZoom = googleMapRef.current.getZoom()
    const isSameCenter = Math.abs(currentCenter.lat() - lat) < 0.000001 && Math.abs(currentCenter.lng() - lng) < 0.000001
    const isSameZoom = zoom === undefined || Math.abs(currentZoom - zoom) < 0.01

    if (isSameCenter && isSameZoom) {
      return
    }

    programmaticMoveInProgressRef.current = true
    googleMapRef.current.panTo({ lat, lng })
    if (zoom !== undefined) {
      googleMapRef.current.setZoom(zoom)
    }
  }, [])

  // Reset to show all markers
  const showAllMarkers = useCallback(() => {
    setSelectedMapItemId(null)
    setShowAllMode(true)

    if (!googleMapRef.current || markersRef.current.size === 0) return

    const bounds = new (window as any).google.maps.LatLngBounds()
    markersRef.current.forEach(marker => {
      bounds.extend(marker.getPosition()!)
    })

    const padding = getResponsivePadding()
    fitBoundsWithMaxZoom(bounds, MULTI_MARKER_MAX_ZOOM, padding, 'show_all_markers')
  }, [fitBoundsWithMaxZoom, getResponsivePadding])

  // Close selected item detail card
  const closeSelectedItem = useCallback(() => {
    setSelectedMapItemId(null)
    const currentDateKey = selectedDate.toLocaleDateString('en-CA')
    userClosedDateRef.current = currentDateKey
  }, [selectedDate])

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
    panToMarker(selectedItem.latitude, selectedItem.longitude, { checkVisibility: true }, 'navigate_to_stop')
  }, [selectedMapItemId, mapItems, getFilteredMapItems, getSortedMappedItems, panToMarker])

  // Recenter camera to show all markers for current date
  const recenterMap = useCallback(() => {
    if (!googleMapRef.current) return

    setSelectedMapItemId(null)
    setShowAllMode(true)

    // If there are markers, fit all markers
    if (markersRef.current.size > 0) {
      const bounds = new (window as any).google.maps.LatLngBounds()
      markersRef.current.forEach(marker => {
        bounds.extend(marker.getPosition()!)
      })

      const padding = getResponsivePadding()
      fitBoundsWithMaxZoom(bounds, MULTI_MARKER_MAX_ZOOM, padding, 'recenter')
    } else if (businessCoordsCacheRef.current && businessCoordsCacheRef.current.lat && businessCoordsCacheRef.current.lng) {
      // If no markers but business coords exist, center on business
      const { lat, lng } = businessCoordsCacheRef.current
      panToMarker(lat, lng, { zoom: HOME_BASE_ONLY_ZOOM }, 'recenter_business')
    }
  }, [fitBoundsWithMaxZoom, getResponsivePadding, panToMarker])

  // Select a specific map item (pass item data directly to avoid dependency on mapItems)
  const selectMapItem = useCallback((itemId: string, latitude: number, longitude: number) => {
    setSelectedMapItemId(itemId)
    setShowAllMode(false)
    panToMarker(latitude, longitude, { checkVisibility: true }, 'select_map_item')
  }, [panToMarker])

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

  // Helper function to extract customer name from lead metadata (canonical source)
  const getCustomerNameFromLead = useCallback((lead: any): string | null => {
    if (!lead) return null
    const meta = lead.raw_metadata || {}
    return meta.customerName || meta.callerName || meta.name || null
  }, [])

  // Type for lead cache data
  type LeadCacheData = Map<string, { name: string | null; phone: string | null }>

  // Batch fetch leads by IDs to avoid N+1 queries
  const fetchLeadsByIds = useCallback(async (leadIds: string[]): Promise<LeadCacheData> => {
    if (leadIds.length === 0) return new Map()

    // Filter out already cached leads
    const uncachedIds = leadIds.filter(id => !leadCache.has(id))
    if (uncachedIds.length === 0) return leadCache

    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, caller_phone, raw_metadata')
        .in('id', uncachedIds)

      if (error) {
        console.error('[ScheduleMap] Failed to fetch leads:', error)
        return leadCache
      }

      const newCache = new Map(leadCache)
      data?.forEach((lead: any) => {
        const meta = lead.raw_metadata || {}
        const name = meta.customerName || meta.callerName || meta.name || null
        newCache.set(lead.id, { name, phone: lead.caller_phone })
      })

      setLeadCache(newCache)
      return newCache
    } catch (error) {
      console.error('[ScheduleMap] Exception fetching leads:', error)
      return leadCache
    }
  }, [leadCache])

  // Helper function to resolve customer information from calendar event
  const getCustomerFromCalendarEvent = useCallback((event: any): { customerName: string | null; customerPhone: string | null; leadId: string | null } => {
    // First try to find a linked job
    const linkedJob = jobs.find(job => job.google_calendar_event_id === event.id)
    if (linkedJob) {
      // Use job.customer_name as primary, but fall back to lead metadata if needed
      let customerName = linkedJob.customer_name
      if (!customerName && linkedJob.lead_id && leadCache.has(linkedJob.lead_id)) {
        customerName = leadCache.get(linkedJob.lead_id)?.name || null
      }
      return {
        customerName,
        customerPhone: linkedJob.customer_phone,
        leadId: linkedJob.lead_id
      }
    }

    // Fallback: check for replyflow_lead_id in extended properties
    // @ts-ignore
    const replyLeadId = event?.extendedProperties?.private?.replyflow_lead_id as string | undefined
    if (replyLeadId) {
      // Try to find a job with this lead_id
      const jobWithLead = jobs.find(job => job.lead_id === replyLeadId)
      if (jobWithLead) {
        let customerName = jobWithLead.customer_name
        if (!customerName && leadCache.has(replyLeadId)) {
          customerName = leadCache.get(replyLeadId)?.name || null
        }
        return {
          customerName,
          customerPhone: jobWithLead.customer_phone,
          leadId: replyLeadId
        }
      }
      // Use cached lead data if available
      if (leadCache.has(replyLeadId)) {
        const leadData = leadCache.get(replyLeadId)!
        return {
          customerName: leadData.name,
          customerPhone: leadData.phone,
          leadId: replyLeadId
        }
      }
      // Return leadId even if we don't have the data yet (will be resolved in next render)
      return {
        customerName: null,
        customerPhone: null,
        leadId: replyLeadId
      }
    }

    return {
      customerName: null,
      customerPhone: null,
      leadId: null
    }
  }, [jobs, leadCache])

  // Get all items for the selected date (jobs, events, tasks) for the list view
  const getSelectedDayItems = useCallback((): Array<{
    id: string
    type: 'job' | 'appointment' | 'task'
    title: string
    customerName: string | null
    address: string | null
    scheduledDate: string | null
    scheduledTime: string | null
    scheduledEndTime: string | null
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
    customerPhone: string | null
    address: string | null
    scheduledDate: string | null
    scheduledTime: string | null
    scheduledEndTime: string | null
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
        customerPhone: job.customer_phone,
        address: serviceAddress,
        scheduledDate: job.scheduled_date,
        scheduledTime: job.scheduled_time,
        scheduledEndTime: null,
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
      const customer = getCustomerFromCalendarEvent(event)
      const hasLocation = Boolean(event.location)

      items.push({
        id: `appointment:${event.id}`,
        type: 'appointment',
        title: event.summary,
        customerName: customer.customerName,
        customerPhone: customer.customerPhone,
        address: event.location,
        scheduledDate: (event.start.dateTime || event.start.date)?.split('T')[0] || null,
        scheduledTime: event.start.dateTime ? event.start.dateTime.split('T')[1]?.substring(0, 5) || null : null,
        scheduledEndTime: event.end.dateTime ? event.end.dateTime.split('T')[1]?.substring(0, 5) || null : null,
        status: null,
        hasLocation,
        leadId: customer.leadId,
        jobId: null,
        taskId: null,
        eventId: event.id,
        latitude: null,
        longitude: null
      })
    })

    // Process tasks
    filteredTasks.forEach(task => {
      let customerName: string | null = null
      let customerPhone: string | null = null

      // Resolve customer from lead cache if task has lead_id
      if (task.lead_id && leadCache.has(task.lead_id)) {
        const leadData = leadCache.get(task.lead_id)
        customerName = leadData?.name || null
        customerPhone = leadData?.phone || null
      }

      items.push({
        id: `task:${task.id}`,
        type: 'task',
        title: task.title,
        customerName,
        customerPhone,
        address: null,
        scheduledDate: task.due_date,
        scheduledTime: task.due_time,
        scheduledEndTime: null,
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
  }, [jobs, calendarEvents, tasks, selectedDate, getCustomerAddressFromLead, leadCache])

  // Geocode addresses and prepare map items
  const prepareMapItems = useCallback(async (preparationId: number) => {
    const { filteredJobs, filteredEvents } = getItemsForDate()
    const items: MapItem[] = []

    // Filter tasks for selected date - use local timezone for consistency with jobs/appointments
    const dateStr = selectedDate.toLocaleDateString('en-CA')
    const filteredTasks = tasks.filter(task => {
      if (!task.due_date) return false
      return task.due_date === dateStr && !task.completed
    })

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

      // Check if already geocoded with valid coordinates
      if (hasCoordinates && isValidCoordinate(job.latitude, job.longitude)) {
        // Resolve customer name with precedence: job.customer_name > job.leads.raw_metadata > lead cache
        let customerName = job.customer_name
        if (!customerName && job.leads?.raw_metadata) {
          customerName = getCustomerNameFromLead(job.leads)
        }
        if (!customerName && job.lead_id && leadCache.has(job.lead_id)) {
          customerName = leadCache.get(job.lead_id)?.name || null
        }

        items.push({
          id: job.id,
          type: 'job',
          title: job.title,
          customerName,
          customerPhone: job.customer_phone,
          address: serviceAddress,
          scheduledDate: job.scheduled_date,
          scheduledTime: job.scheduled_time,
          scheduledEndTime: null,
          status: job.status,
          leadId: job.lead_id,
          jobId: job.id,
          taskId: null,
          eventId: job.google_calendar_event_id || null,
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
            if (!isValidCoordinate(result.latitude, result.longitude)) {
              console.warn('[ScheduleMap] Geocoding returned invalid coordinates for job:', job.id, result)
            } else {
              // Resolve customer name with precedence: job.customer_name > job.leads.raw_metadata > lead cache
              let customerName = job.customer_name
              if (!customerName && job.leads?.raw_metadata) {
                customerName = getCustomerNameFromLead(job.leads)
              }
              if (!customerName && job.lead_id && leadCache.has(job.lead_id)) {
                customerName = leadCache.get(job.lead_id)?.name || null
              }

              items.push({
              id: job.id,
              type: 'job',
              title: job.title,
              customerName,
              customerPhone: job.customer_phone,
              address: serviceAddress,
              scheduledDate: job.scheduled_date,
              scheduledTime: job.scheduled_time,
              scheduledEndTime: null,
              status: job.status,
              leadId: job.lead_id,
              jobId: job.id,
              taskId: null,
              eventId: job.google_calendar_event_id || null,
              latitude: result.latitude,
              longitude: result.longitude
            })
            }
          } else {
            console.error('[ScheduleMap] Geocoding failed for job:', job.id, result.error)
          }
        } catch (error) {
          console.error('[ScheduleMap] Geocoding exception for job:', job.id, error)
        }
      }
    }

    // Collect lead_ids that need to be fetched
    const leadIdsToFetch: string[] = []

    // Check jobs for missing customer data
    for (const job of filteredJobs) {
      if (job.lead_id && !job.customer_name && !job.leads?.raw_metadata && !leadCache.has(job.lead_id)) {
        leadIdsToFetch.push(job.lead_id)
      }
    }

    // Check events for replyflow_lead_id without linked job
    for (const event of filteredEvents) {
      const hasLinkedJob = jobs.some(job => job.google_calendar_event_id === event.id)
      if (!hasLinkedJob) {
        // @ts-ignore
        const replyLeadId = event?.extendedProperties?.private?.replyflow_lead_id as string | undefined
        if (replyLeadId && !leadCache.has(replyLeadId)) {
          leadIdsToFetch.push(replyLeadId)
        }
      }
    }

    // Check tasks for missing customer data
    for (const task of filteredTasks) {
      if (task.lead_id && !leadCache.has(task.lead_id)) {
        leadIdsToFetch.push(task.lead_id)
      }
    }

    // Batch fetch unique leads if needed
    const uniqueLeadIds = Array.from(new Set(leadIdsToFetch))
    if (uniqueLeadIds.length > 0) {
      await fetchLeadsByIds(uniqueLeadIds)
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

        // Validate cached coordinates
        if (!isValidCoordinate(cached.lat, cached.lng)) {
          console.warn('[ScheduleMap] Skipping calendar event with invalid cached coordinates:', event.id, cached)
          continue
        }

        const dateTime = event.start.dateTime
        const dateOnly = event.start.date
        const endDateTime = event.end.dateTime
        const customer = getCustomerFromCalendarEvent(event)
        items.push({
          id: `appointment:${event.id}`,
          type: 'appointment',
          title: event.summary,
          customerName: customer.customerName,
          customerPhone: customer.customerPhone,
          address: cached.formattedAddress,
          scheduledDate: dateTime ? dateTime.split('T')[0] : (dateOnly || null),
          scheduledTime: dateTime ? (dateTime.split('T')[1]?.slice(0, 5) || null) : null,
          scheduledEndTime: endDateTime ? (endDateTime.split('T')[1]?.slice(0, 5) || null) : null,
          status: null,
          leadId: customer.leadId,
          jobId: null,
          taskId: null,
          eventId: event.id,
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
            // Validate geocoding result
            if (!isValidCoordinate(result.latitude, result.longitude)) {
              console.warn('[ScheduleMap] Geocoding returned invalid coordinates for calendar event:', event.id, result)
              // Cache as failure to prevent repeated attempts
              calendarEventCoordsCacheRef.current.set(cacheKey, null)
              continue
            }

            // Cache the result
            calendarEventCoordsCacheRef.current.set(cacheKey, {
              lat: result.latitude,
              lng: result.longitude,
              formattedAddress: result.formattedAddress || normalizedLocation
            })

            const dateTime = event.start.dateTime
            const dateOnly = event.start.date
            const endDateTime = event.end.dateTime
            const customer = getCustomerFromCalendarEvent(event)
            items.push({
              id: `appointment:${event.id}`,
              type: 'appointment',
              title: event.summary,
              customerName: customer.customerName,
              customerPhone: customer.customerPhone,
              address: result.formattedAddress || normalizedLocation,
              scheduledDate: dateTime ? dateTime.split('T')[0] : (dateOnly || null),
              scheduledTime: dateTime ? (dateTime.split('T')[1]?.slice(0, 5) || null) : null,
              scheduledEndTime: endDateTime ? (endDateTime.split('T')[1]?.slice(0, 5) || null) : null,
              status: null,
              leadId: customer.leadId,
              jobId: null,
              taskId: null,
              eventId: event.id,
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

    // Check if this preparation is still the most recent (prevents stale async results)
    // Check BEFORE adding business marker to prevent partial-set publication when business geocoding completes
    if (preparationId !== mapPreparationIdRef.current) {
      console.log('[SCHEDULE_MAP_STALE_PREPARATION]', {
        preparationId,
        latestPreparationId: mapPreparationIdRef.current,
        reason: 'superseded_by_newer_preparation',
        hasBusinessMarker: items.some(i => i.type === 'business')
      })
      return
    }

    // Add business location marker if available
    const businessCoords = businessCoordsCacheRef.current
    const businessGeocodingInProgress = businessGeocodingInProgressRef.current

    // If business geocoding is still in progress, defer publication to prevent partial-set race
    // The business geocode effect will trigger a re-run via setBusinessGeocodeTrigger when complete
    if (businessGeocodingInProgress) {
      console.log('[SCHEDULE_MAP_DEFER_PUBLICATION]', {
        preparationId,
        reason: 'business_geocoding_in_progress',
        willRetry: true
      })
      return
    }

    if (businessCoords && business) {
      // Validate business coordinates
      if (!isValidCoordinate(businessCoords.lat, businessCoords.lng)) {
        console.warn('[ScheduleMap] Skipping business marker with invalid coordinates:', businessCoords)
      } else {
        items.push({
        id: 'business:home',
        type: 'business',
        title: business.name || 'Business',
        customerName: null,
        customerPhone: null,
        address: businessCoords.formattedAddress,
        scheduledDate: null,
        scheduledTime: null,
        scheduledEndTime: null,
        status: 'business',
        leadId: null,
        jobId: null,
        taskId: null,
        eventId: null,
        latitude: businessCoords.lat,
        longitude: businessCoords.lng
      })
      }
    }

    // Check if this preparation is still the most recent (prevents stale async results)
    // This guard is AFTER adding the business marker to ensure we don't publish a partial set
    // when business geocoding completes after this preparation started
    if (preparationId !== mapPreparationIdRef.current) {
      console.log('[SCHEDULE_MAP_STALE_PREPARATION]', {
        preparationId,
        latestPreparationId: mapPreparationIdRef.current,
        reason: 'superseded_by_newer_preparation',
        hasBusinessMarker: items.some(i => i.type === 'business')
      })
      return
    }

    // DIAGNOSTIC: Log marker derivation
    console.log('[SCHEDULE_MAP_MARKERS_DERIVED]', {
      preparationId,
      selectedDate: selectedDate.toISOString(),
      totalItems: items.length,
      businessMarker: items.some(i => i.type === 'business'),
      jobMarkers: items.filter(i => i.type === 'job').length,
      appointmentMarkers: items.filter(i => i.type === 'appointment').length,
      timestamp: Date.now()
    })

    setMapItems(items)
    setIsLoading(false)
  }, [getItemsForDate, fetchLeadsByIds, leadCache, jobs, getCustomerNameFromLead])

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
  // IMPORTANT: This effect must NOT depend on mapType to prevent map recreation on toggle
  // Map type changes are handled by a separate effect that calls setMapTypeId on the existing instance
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

    let map: any = null
    let dragstartListener: any = null
    let dragendListener: any = null
    let zoomChangedListener: any = null
    let idleListener: any = null

    try {
      const isMobile = window.innerWidth < 768
      const initialMapTypeId = mapType === 'satellite'
        ? (window as any).google.maps.MapTypeId.HYBRID
        : (window as any).google.maps.MapTypeId.ROADMAP

      // Use business location as initial center if available, otherwise use safe fallback
      // Safe fallback prevents crash when getCenter() is called before map establishes valid center
      let initialCenter: { lat: number; lng: number }
      let initialZoom = 4

      if (businessCoordsCacheRef.current && businessCoordsCacheRef.current.lat && businessCoordsCacheRef.current.lng) {
        initialCenter = {
          lat: businessCoordsCacheRef.current.lat,
          lng: businessCoordsCacheRef.current.lng
        }
        initialZoom = HOME_BASE_ONLY_ZOOM // Use regional zoom for business location
      } else {
        // Safe fallback: US center (will be overridden by automatic framing when markers hydrate)
        initialCenter = { lat: 39.8283, lng: -98.5795 }
      }

      const mapOptions: any = {
        center: initialCenter,
        zoom: initialZoom,
        mapTypeId: initialMapTypeId,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy',
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          },
          {
            featureType: 'poi.business',
            stylers: [{ visibility: 'off' }]
          },
          {
            featureType: 'transit',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          },
          {
            featureType: 'administrative',
            elementType: 'labels',
            stylers: [{ visibility: 'simplified' }]
          }
        ]
      }

      map = new (window as any).google.maps.Map(container, mapOptions)
      opCountersRef.current.mapCreate++
      logOperation('mapCreate')

      // Log map instance creation
      mapInstanceCounter++
      mapInstanceIdRef.current = `map-${mapInstanceCounter}-${Date.now()}`
      console.log('[SCHEDULE_MAP_INSTANCE_CREATED]', { id: mapInstanceIdRef.current, timestamp: Date.now() })

      // Simplified camera listeners with listener tracking for cleanup
      dragstartListener = map.addListener('dragstart', () => {
        // Defensive guard: check ref exists before accessing
        if (userInteractedForContextRef.current !== undefined) {
          userInteractedForContextRef.current = true
        }
        if (activeGestureRef.current !== undefined) {
          activeGestureRef.current = true
        }
      })

      dragendListener = map.addListener('dragend', () => {
        // Drag completed - user has interacted
        const dragEndTime = Date.now()
        console.log('[SCHEDULE_MAP_DRAGEND]', {
          timestamp: dragEndTime,
          mapInstance: mapInstanceIdRef.current
        })
        if (activeGestureRef.current !== undefined) {
          activeGestureRef.current = false
        }
        // Track operations in the next 500ms after dragend
        setTimeout(() => {
          const opsAfterDrag = opTimestampsRef.current.filter(op => op.timestamp >= dragEndTime && op.timestamp < dragEndTime + 500)
          if (opsAfterDrag.length > 0) {
            console.warn('[SCHEDULE_MAP_POST_DRAG_OPS]', {
              count: opsAfterDrag.length,
              operations: opsAfterDrag,
              mapInstance: mapInstanceIdRef.current
            })
          }
        }, 500)
      })

      zoomChangedListener = map.addListener('zoom_changed', () => {
        // Only record user interaction if this is NOT a programmatic move
        // This prevents the zoom cap in fitBoundsWithMaxZoom from disabling corrective frames
        // Defensive guard: check ref exists before accessing
        if (programmaticMoveInProgressRef.current !== undefined &&
            !programmaticMoveInProgressRef.current) {
          userInteractedForContextRef.current = true
        }
      })

      idleListener = map.addListener('idle', () => {
        // Defensive guard: check ref exists before accessing
        if (programmaticMoveInProgressRef.current !== undefined) {
          programmaticMoveInProgressRef.current = false
        }
      })

      googleMapRef.current = map
      setMapReady(true)
    } catch (error) {
      console.error('[ScheduleMap] Failed to initialize map:', error)
      console.error('[ScheduleMap_CRASH_DIAGNOSTICS]', {
        error: error instanceof Error ? error.message : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        mapInstanceId: mapInstanceIdRef.current,
        isMapLoaded,
        mapType,
        containerExists: !!mapRef.current,
        containerDimensions: mapRef.current ? { width: mapRef.current.offsetWidth, height: mapRef.current.offsetHeight } : null,
        businessCoordsCache: businessCoordsCacheRef.current,
        selectedDate: selectedDate.toISOString(),
        mapFilter,
        markerCount: markersRef.current.size,
        programmaticMoveInProgress: programmaticMoveInProgressRef.current,
        userInteracted: userInteractedForContextRef.current,
        timestamp: Date.now()
      })
      setMapError('Failed to initialize Google Maps')
      setIsLoading(false)
    }

    // Cleanup function to remove listeners and prevent stale callbacks
    return () => {
      if (dragstartListener) {
        try {
          (window as any).google.maps.event.removeListener(dragstartListener)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (dragendListener) {
        try {
          (window as any).google.maps.event.removeListener(dragendListener)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (zoomChangedListener) {
        try {
          (window as any).google.maps.event.removeListener(zoomChangedListener)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (idleListener) {
        try {
          (window as any).google.maps.event.removeListener(idleListener)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      // Clear map reference to prevent stale callbacks
      // Only clear on actual component unmount, not on effect rerun
      // mapType changes are handled by separate effect without recreating the map
      if (map && isUnmountingRef.current) {
        googleMapRef.current = null
      }
    }
  }, [isMapLoaded])

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
          const duringGesture = activeGestureRef.current
          console.log('[SCHEDULE_MAP_RESIZE]', {
            old: `${lastSize.width}x${lastSize.height}`,
            new: `${width}x${height}`,
            reason: 'container_resize',
            mapInstance: mapInstanceIdRef.current,
            duringGesture,
            timestamp: Date.now()
          })
          if (duringGesture) {
            console.warn('[SCHEDULE_MAP_RESIZE_DURING_GESTURE]', 'ResizeObserver fired during active gesture - this may cause rubber-band feel')
          }
          resizeLastSizeRef.current = { width, height }
        }
      }
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [mapReady])

  // Clear stale selection when date changes and selected item no longer exists
  useEffect(() => {
    if (selectedMapItemId && mapItems.length > 0) {
      const itemExists = mapItems.some(item => item.id === selectedMapItemId)
      if (!itemExists) {
        console.log('[SCHEDULE_MAP_STALE_SELECTION]', {
          clearing: selectedMapItemId,
          reason: 'item_not_in_new_date',
          availableItems: mapItems.map(i => i.id)
        })
        setSelectedMapItemId(null)
        setSelectedMarker(null)
        setShowAllMode(true)
      }
    }
  }, [selectedDate, selectedMapItemId, mapItems])

  // Generate a signature of the data to detect meaningful changes without causing jitter
  const getDataSignature = useCallback(() => {
    const dateStr = selectedDate.toLocaleDateString('en-CA')
    const jobIds = jobs.filter(j => j.scheduled_date === dateStr).map(j => `${j.id}:${j.service_address}:${j.latitude}:${j.longitude}`).join('|')
    const eventIds = calendarEvents.filter(e => (e.start.dateTime || e.start.date)?.startsWith(dateStr)).map(e => `${e.id}:${e.location}`).join('|')
    const taskIds = tasks.filter(t => t.due_date === dateStr && !t.completed).map(t => t.id).join('|')
    return `${dateStr}|${jobIds}|${eventIds}|${taskIds}`
  }, [jobs, calendarEvents, tasks, selectedDate])

  // Prepare map items when date changes, business geocoding completes, or data meaningfully changes (with race condition guard)
  useEffect(() => {
    const preparationId = ++mapPreparationIdRef.current
    const dateKey = selectedDate.toISOString().split('T')[0]

    let isCancelled = false

    const prepare = async () => {
      // Do NOT set isLoading to true - keep map visible during data preparation
      await prepareMapItems(preparationId)

      // Check if this result is still relevant after async work completes
      const currentDateKey = selectedDate.toISOString().split('T')[0]
      if (dateKey !== currentDateKey || isCancelled) {
        return
      }
    }

    prepare()

    return () => {
      isCancelled = true
    }
  }, [selectedDate, businessGeocodeTrigger, getDataSignature])

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
    const sortedWithCorrectStopNumbers = assignStopNumbers(sortedWithStopNumbers)

    const stopNumberLookup = new Map<string, number>()
    sortedWithCorrectStopNumbers.forEach(item => {
      if (item.stopNumber !== undefined) {
        stopNumberLookup.set(item.id, item.stopNumber)
      }
    })

    // Group items by location
    const markerInfos = groupItemsByLocation(filteredItems)

    // Skip marker updates during active manual gestures to prevent visual desync
    // Native Google Maps markers are synchronized with the map, but recreating/updating
    // them during a drag can cause visual artifacts. Markers will update after gesture ends.
    if (activeGestureRef.current) {
      return
    }

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
        existingMarker.setIcon(createNumberedMarkerIcon(isBusinessMarker ? 0 : stopNumber, primaryItem.type, isSelected))
        opCountersRef.current.markerSetIcon++
        logOperation('markerSetIcon')
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
          icon: createNumberedMarkerIcon(isBusinessMarker ? 0 : stopNumber, primaryItem.type, isSelected),
          zIndex: isSelected ? 1000 : 1,
          shape: createMarkerShape(isSelected ? 44 : 36) // Consistent 44px touch target centered on icon
        })

        opCountersRef.current.markerCreate++
        logOperation('markerCreate')

        marker.addListener('click', () => {
          if (markerInfo.items.length === 1) {
            selectMapItem(markerInfo.items[0].id, markerInfo.items[0].latitude, markerInfo.items[0].longitude)
          } else {
            // For grouped markers, select the first item chronologically as default
            // This ensures map/list synchronization works even when multiple items share a location
            const sortedItems = [...markerInfo.items].sort((a, b) => {
              const timeA = a.scheduledTime || '00:00'
              const timeB = b.scheduledTime || '00:00'
              const timeCompare = timeA.localeCompare(timeB)
              if (timeCompare !== 0) return timeCompare
              // Stable tie-breaker: use item ID for identical times
              return a.id.localeCompare(b.id)
            })
            const firstItem = sortedItems[0]
            selectMapItem(firstItem.id, firstItem.latitude, firstItem.longitude)
            setSelectedMarker(markerInfo) // Still show popup for easy access to other items
          }
        })

        // Add hover feedback for desktop discoverability
        marker.addListener('mouseenter', () => {
          // Only apply hover effect to unselected markers
          const isMarkerSelected = selectedMapItemId !== null && markerInfo.items.some(item => item.id === selectedMapItemId)
          if (!isMarkerSelected) {
            marker.setOpacity(0.8)
          }
        })

        marker.addListener('mouseleave', () => {
          // Always restore full opacity on mouse leave
          marker.setOpacity(1.0)
        })

        markersRef.current.set(markerKey, marker)
      }
    })

    // Remove markers that no longer exist
    markersRef.current.forEach((marker, key) => {
      if (!currentMarkerIds.has(key)) {
        marker.setMap(null)
        opCountersRef.current.markerSetMap++
        markersRef.current.delete(key)
        opCountersRef.current.markerCleanup++
      }
    })

    // Calculate semantic context key using canonical local date (YYYY-MM-DD format)
    // This aligns with job/appointment filtering which uses toLocaleDateString('en-CA')
    const selectedDateKey = selectedDate.toLocaleDateString('en-CA')
    const contextKey = `${selectedDateKey}:${mapFilter}`

    // Calculate marker signature: sort by type:id and concatenate with coordinates
    const sortedItemsForSignature = [...filteredItems].sort((a, b) => {
      // Sort by type first, then by id
      if (a.type !== b.type) return a.type.localeCompare(b.type)
      return a.id.localeCompare(b.id)
    })
    const signature = sortedItemsForSignature.map(item =>
      `${item.type}:${item.id}:${item.latitude.toFixed(6)}:${item.longitude.toFixed(6)}`
    ).join('|')

    // Check if context changed
    const contextChanged = contextKey !== semanticContextKeyRef.current
    if (contextChanged) {
      semanticContextKeyRef.current = contextKey
      userInteractedForContextRef.current = false
      correctiveFrameUsedForContextRef.current = false
    }

    // Check if signature changed
    const signatureChanged = signature !== framedSignatureForContextRef.current

    // Get responsive padding for multi-marker views
    const padding = getResponsivePadding()

    // PASSIVE AUTO-FRAME ONLY: Do not auto-select markers on context change
// Auto-selection would cause panToMarker to override the fitBounds viewport
// Explicit user selection (clicking a stop card) still works normally

    // Simplified auto-fit logic:
    // - Context change: always frame (initial frame for new context)
    // - Signature change without context change: at most one corrective frame if user hasn't interacted
    // - Never frame during active manual gestures (drag/zoom)
    const shouldAutoFit = markersRef.current.size > 0 &&
                          !userInteractedForContextRef.current &&
                          !activeGestureRef.current &&
                          (
                            contextChanged ||
                            (signatureChanged && !correctiveFrameUsedForContextRef.current && !contextChanged)
                          )

    if (shouldAutoFit) {

      framedSignatureForContextRef.current = signature

      // Mark corrective frame as used if this was a signature-only change
      if (signatureChanged && !contextChanged) {
        correctiveFrameUsedForContextRef.current = true
      }

      // Build viewport marker set for automatic framing
      // Include ALL valid markers (business + all service markers)
      try {
        const viewportMarkers = Array.from(markersRef.current.entries())

        const bounds = new (window as any).google.maps.LatLngBounds()
        viewportMarkers.forEach(([, marker]) => {
          bounds.extend(marker.getPosition()!)
        })
        fitBoundsWithMaxZoom(bounds, MULTI_MARKER_MAX_ZOOM, padding, 'auto_frame')
      } catch (frameError) {
        console.error('[ScheduleMap_CRASH_DIAGNOSTICS] framing_failed', {
          error: frameError instanceof Error ? frameError.message : 'Unknown',
          stack: frameError instanceof Error ? frameError.stack : undefined,
          context: contextKey,
          signatureChanged,
          markerCount: markersRef.current.size,
          mapInstance: mapInstanceIdRef.current,
          mapExists: !!googleMapRef.current,
          programmaticMoveInProgress: programmaticMoveInProgressRef.current,
          timestamp: Date.now()
        })
      }
    } else if (contextChanged && userInteractedForContextRef.current) {
      // User manually interacted, skip framing
    } else if (!contextChanged && !signatureChanged) {
      // No change, skip framing
    } else if (!contextChanged && signatureChanged && correctiveFrameUsedForContextRef.current) {
      // Corrective frame already used, skip framing
    }

    return () => {
      // Clean up all markers on unmount
      markersRef.current.forEach(marker => {
        marker.setMap(null)
        opCountersRef.current.markerSetMap++
      })
      markersRef.current.clear()
    }
  }, [mapItems, groupItemsByLocation, mapReady, getFilteredMapItems, showAllMode, fitBoundsWithMaxZoom, selectedMapItemId, selectedDate, mapFilter, getResponsivePadding, assignStopNumbers, getSortedMappedItems, mapType])

  // Expose performance counters to browser console for gesture performance measurement
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__scheduleMapPerf = {
        getRenderCount: () => renderCountRef.current,
        getGestureRenderCount: () => gestureRenderCountRef.current,
        getOpCounters: () => ({ ...opCountersRef.current }),
        getOpTimestamps: () => [...opTimestampsRef.current],
        getOpsDuringGesture: () => opTimestampsRef.current.filter(op => op.duringGesture),
        resetCounters: () => {
          gestureRenderCountRef.current = 0
          opTimestampsRef.current = []
          opCountersRef.current = {
            mapCreate: 0,
            markerCreate: 0,
            markerSetMap: 0,
            markerSetIcon: 0,
            markerSetPosition: 0,
            mapSetCenter: 0,
            mapPanTo: 0,
            mapFitBounds: 0,
            mapSetZoom: 0,
            mapSetOptions: 0,
            markerCleanup: 0
          }
        },
        getActiveGesture: () => activeGestureRef.current,
        getMapInstance: () => mapInstanceIdRef.current,
        getMarkerCount: () => markersRef.current.size,
        getDevicePixelRatio: () => window.devicePixelRatio,
        getCanvasScale: () => window.devicePixelRatio || 1 // Canvas backing-store scale (DPR)
      }
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__scheduleMapPerf
      }
    }
  }, [])

  // Update marker icons when selection changes (without triggering camera changes)
  useEffect(() => {
    if (!mapReady) return

    // Skip marker updates during active manual gestures to prevent visual desync
    if (activeGestureRef.current) {
      return
    }

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
    const sortedWithCorrectStopNumbers = assignStopNumbers(sortedWithStopNumbers)

    const stopNumberLookup = new Map<string, number>()
    sortedWithCorrectStopNumbers.forEach(item => {
      if (item.stopNumber !== undefined) {
        stopNumberLookup.set(item.id, item.stopNumber)
      }
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
        const type = key.startsWith('appointment:') ? 'appointment' : key.startsWith('business:') ? 'business' : 'job'
        const isBusiness = type === 'business'

        marker.setIcon(createNumberedMarkerIcon(isBusiness ? 0 : stopNumber, type, isSelected))
        opCountersRef.current.markerSetIcon++
        logOperation('markerSetIcon_selection')
        marker.setZIndex(isSelected ? 1000 : 1)
      }
    })
  }, [selectedMapItemId, mapReady, getFilteredMapItems, mapItems, assignStopNumbers])

  // Log map instance destruction on unmount
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true
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
    // Use actual device pixel ratio for HiDPI canvas backing store
    const dpr = window.devicePixelRatio || 1

    // Include DPR in cache key to prevent wrong-scale cache hits when DPR changes
    const cacheKey = `${type === 'business' ? 0 : stopNumber}-${type}-${isSelected}-${dpr}`

    // Return cached icon if available
    if (markerIconCache.has(cacheKey)) {
      return markerIconCache.get(cacheKey)
    }

    const isBusiness = type === 'business'
    // Business marker keeps its distinct color, stops use palette based on number
    const color = isBusiness ? '#059669' : STOP_COLOR_PALETTE[(stopNumber - 1) % STOP_COLOR_PALETTE.length]
    const size = isSelected ? 44 : 36
    const strokeWidth = isSelected ? 3 : 2
    const textColor = '#FFFFFF'

    // Create canvas for numbered marker
    // Canvas backing store uses physical pixels for crisp rendering
    const canvas = document.createElement('canvas')
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')!
    // Scale drawing context so we draw in logical coordinates
    ctx.scale(dpr, dpr)

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
      // scaledSize is the DISPLAYED size in logical pixels, not backing-store dimensions
      scaledSize: new (window as any).google.maps.Size(size, size),
      // anchor is in logical displayed coordinates, not backing-store coordinates
      anchor: new (window as any).google.maps.Point(size / 2, size / 2)
    }

    // Cache the icon
    markerIconCache.set(cacheKey, icon)

    return icon
  }

  // Create marker shape for consistent touch targets (44px diameter = 22px radius)
  // Coordinates are relative to the icon's top-left corner, so we center the circle
  // For 36px icon: center at (18, 18), for 44px icon: center at (22, 22)
  const createMarkerShape = (iconSize: number): any => {
    const centerX = iconSize / 2
    const centerY = iconSize / 2
    const radius = 22 // 44px diameter for consistent touch target
    return {
      type: 'circle',
      coords: [centerX, centerY, radius] // [x, y, radius] relative to icon top-left
    }
  }

  // Handle marker info card actions
  const handleViewItem = useCallback((item: MapItem) => {
    if (item.type === 'job' && item.jobId) {
      onViewJob(item.jobId)
    } else if (item.type === 'appointment' && item.eventId && onEditEvent) {
      const event = calendarEvents.find(e => e.id === item.eventId)
      if (event) {
        onEditEvent(event)
      }
    } else if (item.leadId) {
      onViewCustomer(item.leadId)
    }
    setSelectedMarker(null)
  }, [calendarEvents, onViewJob, onEditEvent, onViewCustomer])

  // Loading state - only show skeleton if Google Maps itself is not loaded
  if (!isMapLoaded && !mapError) {
    return (
      <div className="flex flex-col h-full">
        {/* Date Navigation Header */}
        <div className="flex items-center justify-between mb-4 px-1">
          <button
            onClick={onPreviousDay}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center w-[140px] flex-none">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground truncate">
              {formatDateShort(selectedDate)}
            </h2>
          </div>
          <button
            onClick={onNextDay}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
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
        <div className="flex items-center justify-center gap-2 mb-4 px-1">
          <button onClick={onPreviousDay} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex-shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center w-[140px] flex-none">
            <h2 className="text-lg font-semibold truncate">{formatDateShort(selectedDate)}</h2>
          </div>
          <button onClick={onNextDay} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex-shrink-0">
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

  // Calculate route summary (count only customer destinations, not Home Base)
  const customerDestinations = sortedItems.filter(item => item.type !== 'business')
  const mappedStopsCount = customerDestinations.length
  const firstStop = customerDestinations[0]
  const lastStop = customerDestinations[customerDestinations.length - 1]
  const routeSummary = mappedStopsCount > 0
    ? `${mappedStopsCount} stop${mappedStopsCount > 1 ? 's' : ''}${firstStop?.scheduledTime && lastStop?.scheduledEndTime ? ` · ${formatTime12Hour(firstStop.scheduledTime)} – ${formatTime12Hour(lastStop.scheduledEndTime)}` : firstStop?.scheduledTime ? ` · ${formatTime12Hour(firstStop.scheduledTime)}` : ''}`
    : 'No mapped stops'

  return (
    <div className="flex flex-col h-full relative">
      {/* Compact date navigation row */}
      <div className="mb-1 md:mb-2 z-10">
        {/* Desktop: Centered date navigation */}
        <div className="hidden md:flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={onPreviousDay}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <div className="text-center w-[220px] flex-none">
              <h2 className="text-base font-semibold text-slate-900 dark:text-foreground truncate">
                {formatDateLong(selectedDate)}
              </h2>
            </div>
            <button
              onClick={onNextDay}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
          <button
            onClick={onGoToToday}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            Today
          </button>
        </div>

        {/* Mobile: Centered date navigation with Today */}
        <div className="md:hidden flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={onPreviousDay}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <div className="text-center w-[140px] flex-none">
              <h2 className="text-base font-semibold text-slate-900 dark:text-foreground truncate">
                {formatDateShort(selectedDate)}
              </h2>
            </div>
            <button
              onClick={onNextDay}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
          <button
            onClick={onGoToToday}
            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Desktop: Combined row with stop previews on left and filters on right */}
      {sortedItems.filter(item => item.type !== 'business').length > 0 ? (
        <div className="hidden md:flex mb-1 z-10 items-center gap-3">
          {/* Stop previews - Left side, takes available space */}
          <div className="flex-1">
            <div className="flex gap-2 overflow-x-auto items-center pb-2 -mx-1 px-1 snap-x snap-mandatory touch-pan-x" id="mobile-stop-cards" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {sortedItems.filter(item => item.type !== 'business').map((item, index) => (
                <button
                  key={item.id}
                  ref={selectedMapItemId === item.id ? (el: any) => {
                    if (el) {
                      setTimeout(() => {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                      }, 100)
                    }
                  } : null}
                  onClick={() => selectMapItem(item.id, item.latitude, item.longitude)}
                  className={`flex-shrink-0 snap-start px-1.5 md:px-2 py-1 rounded-md border transition-colors min-w-[100px] md:min-w-[150px] max-w-[140px] md:max-w-[170px] ${
                    selectedMapItemId === item.id
                      ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-300/60 dark:border-blue-700/60 ring-1 ring-blue-200/50 dark:ring-blue-800/30'
                      : item.type === 'business'
                        ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200/60 dark:border-green-700/60 hover:bg-green-100/50 dark:hover:bg-green-900/15'
                        : 'bg-white/70 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50/70 dark:hover:bg-slate-700/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {item.type === 'business' ? (
                      <div className="w-4 h-4 md:w-4.5 md:h-4.5 rounded flex items-center justify-center text-[8px] md:text-[9px] bg-green-100/50 dark:bg-green-900/15 text-green-600 dark:text-green-400 flex-shrink-0">
                        🏠
                      </div>
                    ) : (
                      <div className={`w-4 h-4 md:w-4.5 md:h-4.5 rounded flex items-center justify-center font-bold text-[8px] md:text-[9px] flex-shrink-0 ${
                        item.type === 'job' ? 'bg-purple-100/50 dark:bg-purple-900/15 text-purple-600 dark:text-purple-400' : 'bg-blue-100/50 dark:bg-blue-900/15 text-blue-600 dark:text-blue-400'
                      }`}>
                        {item.stopNumber}
                      </div>
                    )}
                    <div className="text-left min-w-0 flex-1">
                      {item.type === 'business' ? (
                        <>
                          <p className="text-[9px] md:text-[11px] font-medium text-foreground truncate">
                            {item.title}
                          </p>
                          <p className="text-[8px] md:text-[9px] text-slate-500 dark:text-slate-400 truncate">
                            Home Base
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[9px] md:text-[11px] font-medium text-foreground truncate">
                            {item.title || (item.type === 'job' ? 'Job' : item.type === 'appointment' ? 'Appointment' : 'Task')}
                          </p>
                          <p className="text-[8px] md:text-[9px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                            {item.type === 'job' && <Briefcase size={10} />}
                            {item.type === 'appointment' && <Calendar size={10} />}
                            {item.type === 'task' && <CheckCircle size={10} />}
                            {formatTimeRangeHHMM(item.scheduledTime, item.scheduledEndTime)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2 flex-wrap px-1">
            {/* Desktop filters - Right side, flex-shrink-0 */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => { setMapFilter('all') }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mapFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
              }`}
            >
              All
            </button>
            <button
              onClick={() => { setMapFilter('jobs') }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mapFilter === 'jobs'
                  ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
              }`}
            >
              Jobs
            </button>
            <button
              onClick={() => { setMapFilter('appointments') }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mapFilter === 'appointments'
                  ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
              }`}
            >
              Appointments
            </button>
          </div>
        </div>
      </div>
      ) : (
        <div className="hidden md:flex mb-1 z-10 items-center gap-3">
          {/* No mapped stops - Left side */}
          <div className="flex-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No mapped stops
            </p>
          </div>

          {/* Filter - Right side, flex-shrink-0 */}
          <div className="flex-shrink-0 flex items-center gap-2 flex-wrap px-1">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => { setMapFilter('all') }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mapFilter === 'all'
                    ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                All
              </button>
              <button
                onClick={() => { setMapFilter('jobs') }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mapFilter === 'jobs'
                    ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                Jobs
              </button>
              <button
                onClick={() => { setMapFilter('appointments') }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mapFilter === 'appointments'
                    ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                Appointments
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Combined row with stop preview on left and filter on right */}
      <div className="md:hidden mb-1 z-10">
        {sortedItems.filter(item => item.type !== 'business').length > 0 ? (
          <div className="flex items-center gap-2">
            {/* Stop preview - Left side, takes available space */}
            <div className="flex-1 min-w-0">
              <div className="flex gap-2 overflow-x-auto items-center pb-2 -mx-1 px-1 snap-x snap-mandatory touch-pan-x" id="mobile-stop-cards" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {sortedItems.filter(item => item.type !== 'business').map((item, index) => (
                  <button
                    key={item.id}
                    ref={selectedMapItemId === item.id ? (el: any) => {
                      if (el) {
                        setTimeout(() => {
                          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                        }, 100)
                      }
                    } : null}
                    onClick={() => selectMapItem(item.id, item.latitude, item.longitude)}
                    className={`flex-shrink-0 snap-start px-1.5 py-1 rounded-md border transition-colors min-w-[100px] max-w-[140px] ${
                      selectedMapItemId === item.id
                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-300/60 dark:border-blue-700/60 ring-1 ring-blue-200/50 dark:ring-blue-800/30'
                        : item.type === 'business'
                          ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200/60 dark:border-green-700/60 hover:bg-green-100/50 dark:hover:bg-green-900/15'
                          : 'bg-white/70 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-50/70 dark:hover:bg-slate-700/30'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {item.type === 'business' ? (
                        <div className="w-4 h-4 rounded flex items-center justify-center text-[8px] bg-green-100/50 dark:bg-green-900/15 text-green-600 dark:text-green-400 flex-shrink-0">
                          🏠
                        </div>
                      ) : (
                        <div className={`w-4 h-4 rounded flex items-center justify-center font-bold text-[8px] flex-shrink-0 ${
                          item.type === 'job' ? 'bg-purple-100/50 dark:bg-purple-900/15 text-purple-600 dark:text-purple-400' : 'bg-blue-100/50 dark:bg-blue-900/15 text-blue-600 dark:text-blue-400'
                        }`}>
                          {item.stopNumber}
                        </div>
                      )}
                      <div className="text-left min-w-0 flex-1">
                        {item.type === 'business' ? (
                          <>
                            <p className="text-[9px] font-medium text-foreground truncate">
                              {item.title}
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-400 truncate">
                              Home Base
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-[9px] font-medium text-foreground truncate">
                              {item.title || (item.type === 'job' ? 'Job' : item.type === 'appointment' ? 'Appointment' : 'Task')}
                            </p>
                            <p className="text-[8px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                              {item.type === 'job' && <Briefcase size={10} />}
                              {item.type === 'appointment' && <Calendar size={10} />}
                              {item.type === 'task' && <CheckCircle size={10} />}
                              {formatTimeRangeHHMM(item.scheduledTime, item.scheduledEndTime)}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Filter - Right side, flex-shrink-0 */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => { setMapFilter('all') }}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    mapFilter === 'all'
                      ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => { setMapFilter('jobs') }}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    mapFilter === 'jobs'
                      ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  Jobs
                </button>
                <button
                  onClick={() => { setMapFilter('appointments') }}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    mapFilter === 'appointments'
                      ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  Appts
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No mapped stops
            </p>
            <div className="flex-shrink-0">
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => { setMapFilter('all') }}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    mapFilter === 'all'
                      ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => { setMapFilter('jobs') }}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    mapFilter === 'jobs'
                      ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  Jobs
                </button>
                <button
                  onClick={() => { setMapFilter('appointments') }}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    mapFilter === 'appointments'
                      ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  Appts
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Map Container - Use fixed height on mobile to prevent extending behind bottom nav */}
      <div className="flex-1 h-[calc(100dvh-var(--bottom-nav-height,80px)-90px)] md:h-auto md:min-h-0 relative rounded-xl overflow-hidden border border-slate-200/60 dark:border-slate-700/60">
        <div ref={mapRef} className="w-full h-full" />
        
        {/* Map Controls Stack */}
        <div className="flex absolute top-3 right-2 z-10 flex-col gap-2 items-end">
          {/* Map Type Toggle - Desktop only */}
          <div className="flex bg-white/95 dark:bg-slate-800/95 rounded-lg shadow-sm border border-slate-200/60 dark:border-slate-700/60 overflow-hidden backdrop-blur-sm">
            <button
              onClick={() => setMapType('roadmap')}
              className={`px-3 py-2 text-xs font-medium transition-colors min-w-[60px] ${
                mapType === 'roadmap'
                  ? 'bg-purple-50/80 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50/80 dark:hover:bg-slate-700/50'
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setMapType('satellite')}
              className={`px-3 py-2 text-xs font-medium transition-colors min-w-[60px] ${
                mapType === 'satellite'
                  ? 'bg-blue-50/80 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50/80 dark:hover:bg-slate-700/50'
              }`}
            >
              Satellite
            </button>
          </div>

          {/* Recenter Button - visible when markers exist or business coordinates exist */}
          {(markersRef.current.size > 0 || (businessCoordsCacheRef.current && businessCoordsCacheRef.current.lat && businessCoordsCacheRef.current.lng)) && (
            <button
              onClick={recenterMap}
              className="w-10 h-10 bg-white/95 dark:bg-slate-800/95 rounded-lg shadow-sm border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center backdrop-blur-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              title="Recenter to show all stops"
              aria-label="Recenter map"
            >
              <Crosshair className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </button>
          )}
        </div>
        
        {/* Selected Item Info Card - Compact on mobile, anchored bottom-left */}
        {selectedItem && (
          <div className="absolute bottom-4 left-4 right-auto max-w-[280px] md:left-6 md:right-auto md:w-80 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200/60 dark:border-slate-700/60 z-20 p-3 md:p-4 duration-150">
            {/* Mobile: Compact layout */}
            <div className="md:hidden">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] flex-shrink-0 ${
                  selectedItem.type === 'business' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                  selectedItem.type === 'job' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                }`}>
                  {selectedItem.type === 'business' ? '🏠' : selectedItem.stopNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-foreground truncate leading-tight">
                    {selectedItem.type === 'business' ? selectedItem.title : (selectedItem.title || selectedItem.customerName || 'Untitled')}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                    {selectedItem.type === 'business' ? 'Home Base' : (
                      <>
                        {selectedItem.type === 'job' ? 'Job' : 'Appointment'} {formatTimeRangeHHMM(selectedItem.scheduledTime, selectedItem.scheduledEndTime) && ` · ${formatTimeRangeHHMM(selectedItem.scheduledTime, selectedItem.scheduledEndTime)}`}
                      </>
                    )}
                  </p>
                </div>
                <button
                  onClick={closeSelectedItem}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors duration-150 flex-shrink-0"
                  aria-label="Close"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedItem.type !== 'business' && (
                <button
                  onClick={() => handleViewItem(selectedItem)}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors duration-150"
                >
                  View details →
                </button>
              )}
            </div>

            {/* Desktop: Simplified layout */}
            <div className="hidden md:block">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  {selectedItem.type === 'business' ? (
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                      🏠
                    </div>
                  ) : (
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                      selectedItem.type === 'job' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    }`}>
                      {selectedItem.stopNumber}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-foreground leading-tight">
                      {selectedItem.type === 'business' ? selectedItem.title : (selectedItem.title || selectedItem.customerName || 'Untitled')}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                      {selectedItem.type === 'business' ? 'Home Base' : (
                        <>
                          {selectedItem.type === 'job' ? 'Job' : 'Appointment'} {formatTimeRangeHHMM(selectedItem.scheduledTime, selectedItem.scheduledEndTime) && ` · ${formatTimeRangeHHMM(selectedItem.scheduledTime, selectedItem.scheduledEndTime)}`}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeSelectedItem}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors duration-150"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedItem.address && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3 truncate leading-tight">
                  {selectedItem.address}
                </p>
              )}

              {selectedItem.type !== 'business' && (
                <button
                  onClick={() => handleViewItem(selectedItem)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors duration-150"
                >
                  View details →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Legacy selected marker info card (for clustered items) */}
        {selectedMarker && !selectedItem && (
          <div className="absolute bottom-4 left-4 right-4 md:left-4 md:right-auto md:w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-3 md:p-4 z-20">
            <div className="flex items-start justify-between mb-2 md:mb-3">
              <h3 className="font-semibold text-sm md:text-base text-slate-900 dark:text-foreground">
                {selectedMarker.items.length} stops at this location
              </h3>
              <button
                onClick={() => setSelectedMarker(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors duration-150"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-1.5 md:space-y-2 max-h-64 overflow-y-auto">
              {selectedMarker.items.map((item, index) => (
                <button
                  key={`${item.type}-${item.id}-${index}`}
                  onClick={() => selectMapItem(item.id, item.latitude, item.longitude)}
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
                        {formatTimeRangeHHMM(item.scheduledTime, item.scheduledEndTime) || 'No time'}
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
