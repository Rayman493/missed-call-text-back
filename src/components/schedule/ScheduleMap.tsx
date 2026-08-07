'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { MapPin, Calendar, Briefcase, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import Skeleton from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

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

interface ScheduleMapProps {
  jobs: Job[]
  calendarEvents: CalendarEvent[]
  selectedDate: Date
  onPreviousDay: () => void
  onNextDay: () => void
  onGoToToday: () => void
  onViewCustomer: (leadId: string) => void
  onViewJob: (jobId: string) => void
}

type MapItemType = 'job' | 'appointment'

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
}

interface MarkerInfo {
  position: { lat: number; lng: number }
  items: MapItem[]
}

export default function ScheduleMap({
  jobs,
  calendarEvents,
  selectedDate,
  onPreviousDay,
  onNextDay,
  onGoToToday,
  onViewCustomer,
  onViewJob
}: ScheduleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const googleMapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMarker, setSelectedMarker] = useState<MarkerInfo | null>(null)
  const [mapItems, setMapItems] = useState<MapItem[]>([])
  const [itemsWithoutAddress, setItemsWithoutAddress] = useState<number>(0)
  const [geocodingFailed, setGeocodingFailed] = useState(false)

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

  // Geocode addresses and prepare map items
  const prepareMapItems = useCallback(async () => {
    const { filteredJobs, filteredEvents } = getItemsForDate()
    const items: MapItem[] = []
    let withoutAddressCount = 0

    // Process jobs
    for (const job of filteredJobs) {
      // Extract fallback address from lead metadata
      const fallbackAddress = getCustomerAddressFromLead(job)
      
      // Use service_address, or fall back to customer address from lead metadata
      const serviceAddress = job.service_address || fallbackAddress

      // Log detailed diagnostics for each job
      const hasRawMetadata = !!job.leads?.raw_metadata
      const rawMetadataKeys = hasRawMetadata ? Object.keys(job.leads!.raw_metadata) : []
      const hasCoordinates = job.latitude !== null && job.latitude !== undefined && job.longitude !== null && job.longitude !== undefined

      console.log('[SCHEDULE_MAP_JOB_PROCESSING]', {
        jobId: job.id,
        customerName: job.customer_name,
        service_address: job.service_address,
        hasRawMetadata,
        rawMetadataKeys,
        extractedFallbackAddress: fallbackAddress,
        finalAddressSelected: serviceAddress,
        hasCoordinates,
        latitude: job.latitude,
        longitude: job.longitude,
        geocoded_address: job.geocoded_address
      })
      
      if (!serviceAddress) {
        console.log('[MAP_ITEM_SKIPPED]', {
          jobId: job.id,
          reason: 'no_address_available',
          serviceAddress: job.service_address,
          fallbackAddress: fallbackAddress,
          hasCoordinates,
          geocodedAddress: job.geocoded_address
        })
        withoutAddressCount++
        continue
      }

      // Check if already geocoded
      if (hasCoordinates) {
        console.log('[SCHEDULE_MAP_USING_CACHED_COORDINATES]', {
          jobId: job.id,
          address: serviceAddress,
          latitude: job.latitude,
          longitude: job.longitude,
          geocoded_address: job.geocoded_address
        })
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
        // Trigger geocoding
        console.log('[SCHEDULE_MAP_ATTEMPTING_GEOCODING]', {
          jobId: job.id,
          address: serviceAddress
        })
        try {
          const response = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: job.id, address: serviceAddress })
          })
          const result = await response.json()
          console.log('[SCHEDULE_MAP_GEOCODING_RESULT]', {
            jobId: job.id,
            success: result.success,
            error: result.error,
            latitude: result.latitude,
            longitude: result.longitude
          })
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
            console.log('[MAP_ITEM_SKIPPED]', {
              jobId: job.id,
              reason: 'geocoding_failed',
              serviceAddress: job.service_address,
              fallbackAddress: fallbackAddress,
              hasCoordinates,
              geocodedAddress: job.geocoded_address,
              geocodingError: result.error
            })
            withoutAddressCount++
          }
        } catch (error) {
          console.error('[ScheduleMap] Geocoding failed for job:', job.id, error)
          console.log('[MAP_ITEM_SKIPPED]', {
            jobId: job.id,
            reason: 'geocoding_exception',
            serviceAddress: job.service_address,
            fallbackAddress: fallbackAddress,
            hasCoordinates,
            geocodedAddress: job.geocoded_address,
            error: error instanceof Error ? error.message : String(error)
          })
          withoutAddressCount++
        }
      }
    }

    // Process calendar events (geocode on the fly for now)
    for (const event of filteredEvents) {
      if (!event.location) {
        withoutAddressCount++
        continue
      }

      // For calendar events, we'll need to geocode on the fly
      // For MVP, we'll skip calendar events without pre-geocoded coordinates
      // In a future enhancement, we could add geocoding to events table
      withoutAddressCount++
    }

    setMapItems(items)
    setItemsWithoutAddress(withoutAddressCount)
    setGeocodingFailed(withoutAddressCount > 0 && items.length === 0)
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

  // Load Google Maps script
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      console.error('[ScheduleMap] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not configured')
      setIsLoading(false)
      return
    }

    if ((window as any).google && (window as any).google.maps) {
      setIsMapLoaded(true)
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.onload = () => setIsMapLoaded(true)
    script.onerror = () => {
      console.error('[ScheduleMap] Failed to load Google Maps script')
      setIsLoading(false)
    }
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(script)
    }
  }, [])

  // Initialize map
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current || googleMapRef.current) return

    const map = new (window as any).google.maps.Map(mapRef.current, {
      center: { lat: 39.8283, lng: -98.5795 }, // Default to US center
      zoom: 4,
      mapTypeId: (window as any).google.maps.MapTypeId.ROADMAP,
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

    googleMapRef.current = map
  }, [isMapLoaded])

  // Prepare map items when date changes
  useEffect(() => {
    prepareMapItems()
  }, [prepareMapItems])

  // Update markers when map items change
  useEffect(() => {
    if (!googleMapRef.current || mapItems.length === 0) return

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null))
    markersRef.current = []

    // Group items by location
    const markerInfos = groupItemsByLocation(mapItems)

    // Create markers
    markerInfos.forEach(markerInfo => {
      const marker = new (window as any).google.maps.Marker({
        position: markerInfo.position,
        map: googleMapRef.current,
        title: markerInfo.items.length === 1 
          ? markerInfo.items[0].title 
          : `${markerInfo.items.length} items`,
        icon: createMarkerIcon(markerInfo.items[0].type, markerInfo.items.length)
      })

      marker.addListener('click', () => {
        setSelectedMarker(markerInfo)
      })

      markersRef.current.push(marker)
    })

    // Fit bounds to show all markers
    if (markersRef.current.length > 0) {
      const bounds = new (window as any).google.maps.LatLngBounds()
      markersRef.current.forEach(marker => {
        bounds.extend(marker.getPosition()!)
      })
      googleMapRef.current.fitBounds(bounds)
    }

    return () => {
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current = []
    }
  }, [mapItems, groupItemsByLocation, isMapLoaded])

  // Create marker icon based on type
  const createMarkerIcon = (type: MapItemType, count: number): any => {
    const color = type === 'job' ? '#8B5CF6' : '#3B82F6' // Purple for jobs, blue for appointments
    const size = count > 1 ? 40 : 32

    return {
      path: (window as any).google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 0.9,
      strokeColor: '#FFFFFF',
      strokeWeight: 2,
      scale: size / 10
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

  // Loading state
  if (isLoading) {
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

  // Empty state
  if (mapItems.length === 0) {
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

        {/* Today button */}
        <div className="flex justify-center mb-4">
          <button
            onClick={onGoToToday}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            Today
          </button>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<MapPin className="w-12 h-12" />}
            title="No mapped stops for this day"
            description={geocodingFailed 
              ? "Jobs and appointments with an address will appear here."
              : "Jobs and appointments with an address will appear here."
            }
          />
          {itemsWithoutAddress > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              {itemsWithoutAddress} scheduled item{itemsWithoutAddress > 1 ? 's don\'t' : ' doesn\'t'} have an address
            </p>
          )}
        </div>
      </div>
    )
  }

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

      {/* Map Container */}
      <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div ref={mapRef} className="w-full h-full" />
        
        {/* Selected Marker Info Card */}
        {selectedMarker && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 z-20">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-slate-900 dark:text-foreground">
                {selectedMarker.items.length === 1 
                  ? selectedMarker.items[0].title 
                  : `${selectedMarker.items.length} stops`}
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

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {selectedMarker.items.map((item, index) => (
                <div
                  key={`${item.type}-${item.id}-${index}`}
                  className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg"
                >
                  <div className="flex items-start gap-2 mb-2">
                    {item.type === 'job' ? (
                      <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-900 dark:text-foreground">
                        {item.title}
                      </p>
                      {item.customerName && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {item.customerName}
                        </p>
                      )}
                    </div>
                  </div>

                  {item.scheduledTime && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                      {formatTime(item.scheduledTime)}
                    </p>
                  )}

                  <p className="text-xs text-slate-500 dark:text-slate-500 mb-2">
                    {item.address}
                  </p>

                  <button
                    onClick={() => handleViewItem(item)}
                    className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {item.type === 'job' ? 'View Job' : 'View Customer'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items without address warning */}
        {itemsWithoutAddress > 0 && (
          <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-auto bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 z-10">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {itemsWithoutAddress} scheduled item{itemsWithoutAddress > 1 ? 's don\'t' : ' doesn\'t'} have an address
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
