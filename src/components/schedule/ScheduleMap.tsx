'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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

interface ScheduleMapProps {
  jobs: Job[]
  calendarEvents: CalendarEvent[]
  tasks: Task[]
  selectedDate: Date
  onPreviousDay: () => void
  onNextDay: () => void
  onGoToToday: () => void
  onViewCustomer: (leadId: string) => void
  onViewJob: (jobId: string) => void
  onEditJob?: (job: Job) => void
  onEditTask?: (task: Task) => void
  onEditEvent?: (event: CalendarEvent) => void
}

type MapItemType = 'job' | 'appointment'

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

export default function ScheduleMap({
  jobs,
  calendarEvents,
  tasks,
  selectedDate,
  onPreviousDay,
  onNextDay,
  onGoToToday,
  onViewCustomer,
  onViewJob,
  onEditJob,
  onEditTask,
  onEditEvent
}: ScheduleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const googleMapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map()) // Marker registry keyed by item ID
  const perDateStateRef = useRef<Map<string, MapDateState>>(new Map())
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
  const [userInteracted, setUserInteracted] = useState(false)
  const [showAllMode, setShowAllMode] = useState(true)
  const [previousDateKey, setPreviousDateKey] = useState<string | null>(null)

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

  // Filter items for selected date
  const getItemsForDate = useCallback(() => {
    const dateStr = selectedDate.toISOString().split('T')[0]
    
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

  // Clear selection if selected item is filtered out
  useEffect(() => {
    if (selectedMapItemId) {
      const filteredItems = getFilteredMapItems(mapItems)
      const isSelectedVisible = filteredItems.some(item => item.id === selectedMapItemId)
      if (!isSelectedVisible) {
        setSelectedMapItemId(null)
        setShowAllMode(true)
        setUserInteracted(false)
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

  // Fit bounds with max zoom constraint
  const fitBoundsWithMaxZoom = useCallback((bounds: any, maxZoom: number = 15) => {
    if (!googleMapRef.current) return
    
    googleMapRef.current.fitBounds(bounds)
    
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
  const panToMarker = useCallback((lat: number, lng: number, zoom?: number) => {
    if (!googleMapRef.current) return
    
    googleMapRef.current.panTo({ lat, lng })
    if (zoom !== undefined) {
      googleMapRef.current.setZoom(zoom)
    }
    setUserInteracted(true)
  }, [])

  // Reset to show all markers
  const showAllMarkers = useCallback(() => {
    setSelectedMapItemId(null)
    setShowAllMode(true)
    setUserInteracted(false)

    if (!googleMapRef.current || markersRef.current.size === 0) return

    const bounds = new (window as any).google.maps.LatLngBounds()
    markersRef.current.forEach(marker => {
      bounds.extend(marker.getPosition()!)
    })
    fitBoundsWithMaxZoom(bounds)
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
    panToMarker(selectedItem.latitude, selectedItem.longitude, 15)
  }, [selectedMapItemId, mapItems, getFilteredMapItems, getSortedMappedItems, panToMarker])

  // Select a specific map item
  const selectMapItem = useCallback((itemId: string) => {
    const filteredItems = getFilteredMapItems(mapItems)
    const item = filteredItems.find(i => i.id === itemId)
    if (!item) return
    
    setSelectedMapItemId(itemId)
    setShowAllMode(false)
    panToMarker(item.latitude, item.longitude, 15)
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
  const prepareMapItems = useCallback(async () => {
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

    // Process calendar events (skip for now - no geocoding support)
    // Calendar events without pre-geocoded coordinates are omitted from map

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

      // Track user interaction with the map
      map.addListener('dragstart', () => setUserInteracted(true))
      map.addListener('zoom_changed', () => setUserInteracted(true))

      googleMapRef.current = map
      setMapReady(true)
    } catch (error) {
      console.error('[ScheduleMap] Failed to initialize map:', error)
      setMapError('Failed to initialize Google Maps')
      setIsLoading(false)
    }
  }, [isMapLoaded, mapType])

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
      if (googleMapRef.current && userInteracted) {
        const center = googleMapRef.current.getCenter()
        const zoom = googleMapRef.current.getZoom()
        state.center = { lat: center.lat(), lng: center.lng() }
        state.zoom = zoom
      }

      // Only save if state actually changed
      if (
        state.selectedMapItemId !== selectedMapItemId ||
        state.filter !== mapFilter ||
        state.userInteracted !== userInteracted
      ) {
        state.selectedMapItemId = selectedMapItemId
        state.filter = mapFilter
        state.userInteracted = userInteracted
        perDateStateRef.current.set(previousDateKey, state)
      }
    }
    setPreviousDateKey(dateKey)
  }, [selectedDate, selectedMapItemId, mapFilter, userInteracted, previousDateKey])

  // Restore per-date state when date changes
  useEffect(() => {
    const dateKey = selectedDate.toISOString().split('T')[0]
    const savedState = perDateStateRef.current.get(dateKey)

    if (savedState) {
      setSelectedMapItemId(savedState.selectedMapItemId)
      setMapFilter(savedState.filter)
      setUserInteracted(savedState.userInteracted)

      // Restore viewport after markers are rendered
      setTimeout(() => {
        if (googleMapRef.current && savedState.center && savedState.zoom) {
          googleMapRef.current.setCenter(savedState.center)
          googleMapRef.current.setZoom(savedState.zoom)
        }
      }, 100)
    } else {
      // First visit - use defaults
      setShowAllMode(true)
      setUserInteracted(false)
    }

    setSelectedMarker(null)
  }, [selectedDate])

  // Prepare map items when date changes (with race condition guard)
  useEffect(() => {
    const dateKey = selectedDate.toISOString().split('T')[0]

    let isCancelled = false

    const prepare = async () => {
      // Do NOT set isLoading to true - keep map visible during data preparation
      await prepareMapItems()

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
  }, [prepareMapItems, selectedDate])

  // Update markers when map items change or map becomes ready
  useEffect(() => {
    if (!mapReady || !googleMapRef.current) {
      return
    }

    const filteredItems = getFilteredMapItems(mapItems)

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
      const stopNumber = primaryItem.stopNumber || 1

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
          title: markerInfo.items.length === 1
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

    // Fit bounds to show all markers (only if not user interacted and in show all mode)
    if (markersRef.current.size > 0 && showAllMode && !userInteracted) {
      const bounds = new (window as any).google.maps.LatLngBounds()
      markersRef.current.forEach(marker => {
        bounds.extend(marker.getPosition()!)
      })
      fitBoundsWithMaxZoom(bounds)
    }

    return () => {
      // Clean up all markers on unmount
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current.clear()
    }
  }, [mapItems, groupItemsByLocation, mapReady, getFilteredMapItems, showAllMode, userInteracted, fitBoundsWithMaxZoom, selectMapItem, selectedMapItemId])

  // Create numbered marker icon
  const createNumberedMarkerIcon = (stopNumber: number, type: MapItemType, isSelected: boolean = false): any => {
    const color = type === 'job' ? '#8B5CF6' : '#3B82F6' // Purple for jobs, blue for appointments
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
    
    // Draw number
    ctx.fillStyle = textColor
    ctx.font = `bold ${size * 0.4}px system-ui, -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(stopNumber.toString(), size / 2, size / 2)
    
    return {
      url: canvas.toDataURL(),
      scaledSize: new (window as any).google.maps.Size(size, size),
      anchor: new (window as any).google.maps.Point(size / 2, size / 2)
    }
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
      {/* Date Navigation Header */}
      <div className="flex items-center justify-between mb-4 px-1 z-10">
        <button
          onClick={onPreviousDay}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Previous day"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
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
          <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Today button */}
      <div className="flex justify-center mb-4 z-10">
        <button
          onClick={onGoToToday}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
        >
          Today
        </button>
      </div>

      {/* Filter and Show All Controls */}
      <div className="flex items-center justify-between mb-4 px-1 z-10">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => { setMapFilter('all') }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mapFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
              }`}
            >
              All
            </button>
            <button
              onClick={() => { setMapFilter('jobs') }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mapFilter === 'jobs'
                  ? 'bg-white dark:bg-slate-700 text-foreground shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
              }`}
            >
              Jobs
            </button>
            <button
              onClick={() => { setMapFilter('appointments') }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            Show All Stops
          </button>
        )}
      </div>

      {/* Selected-Day Item List (All items: jobs, appointments, tasks) */}
      <div className="mb-4 z-10">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-foreground">Today's Schedule</h3>
          </div>
          <div>
            {(() => {
              const selectedDayItems = getSelectedDayItems()
              if (selectedDayItems.length === 0) {
                return (
                  <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No items scheduled for this day
                  </div>
                )
              }
              return selectedDayItems.map((item) => {
                const isSelected = selectedListItem?.id === item.id
                const isMappable = item.hasLocation && item.latitude !== null && item.longitude !== null

                const handleItemClick = () => {
                  setSelectedListItem(item)
                  if (isMappable && item.jobId) {
                    selectMapItem(item.jobId)
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
                  handleEditClick(e)
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

                return (
                  <button
                    key={item.id}
                    onClick={handleItemClick}
                    className={`w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0 ${
                      isSelected ? 'bg-slate-50 dark:bg-slate-700/50' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getItemColor()}`}>
                      {getItemIcon()}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {formatItemTime(item.scheduledTime)}
                        </p>
                        {!item.hasLocation && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            No location
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.title}
                      </p>
                      {item.customerName && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {item.customerName}
                        </p>
                      )}
                      {item.address && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                          {item.address}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {!item.hasLocation && item.type !== 'task' && (
                        <button
                          onClick={handleAddLocationClick}
                          className="text-[10px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          Add location
                        </button>
                      )}
                      {item.hasLocation && (
                        <button
                          onClick={handleEditClick}
                          className="text-[10px] px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      {item.type === 'task' && (
                        <button
                          onClick={handleEditClick}
                          className="text-[10px] px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
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

      {/* Mobile Horizontal Stop Cards */}
      {sortedItems.length > 0 && (
        <div className="md:hidden mb-4 z-10">
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

      {/* Map Container */}
      <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div ref={mapRef} className="w-full h-full" />
        
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
