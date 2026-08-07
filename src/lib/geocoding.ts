/**
 * Server-side geocoding utility for Google Maps Geocoding API
 * This should only be used on the server to protect API keys
 */

export interface GeocodeResult {
  latitude: number
  longitude: number
  formattedAddress: string
  success: boolean
  error?: string
}

/**
 * Geocode an address using Google Maps Geocoding API
 * @param address - The address to geocode
 * @returns GeocodeResult with coordinates or error
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY
  
  if (!apiKey) {
    console.error('[Geocoding] GOOGLE_MAPS_GEOCODING_API_KEY not configured')
    return {
      success: false,
      error: 'Geocoding service not configured',
      latitude: 0,
      longitude: 0,
      formattedAddress: ''
    }
  }

  if (!address || address.trim().length === 0) {
    return {
      success: false,
      error: 'Address is empty',
      latitude: 0,
      longitude: 0,
      formattedAddress: ''
    }
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
    url.searchParams.append('address', address)
    url.searchParams.append('key', apiKey)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Geocoding] API error:', response.status, errorText)
      return {
        success: false,
        error: `Geocoding API error: ${response.status}`,
        latitude: 0,
        longitude: 0,
        formattedAddress: ''
      }
    }

    const data = await response.json()

    if (data.status !== 'OK') {
      console.error('[Geocoding] Geocoding failed:', data.status, data.error_message)
      return {
        success: false,
        error: data.error_message || `Geocoding failed: ${data.status}`,
        latitude: 0,
        longitude: 0,
        formattedAddress: ''
      }
    }

    if (!data.results || data.results.length === 0) {
      return {
        success: false,
        error: 'No results found for address',
        latitude: 0,
        longitude: 0,
        formattedAddress: ''
      }
    }

    const result = data.results[0]
    const { lat, lng } = result.geometry.location

    return {
      success: true,
      latitude: lat,
      longitude: lng,
      formattedAddress: result.formatted_address
    }
  } catch (error) {
    console.error('[Geocoding] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      latitude: 0,
      longitude: 0,
      formattedAddress: ''
    }
  }
}

/**
 * Batch geocode multiple addresses
 * @param addresses - Array of addresses to geocode
 * @returns Array of GeocodeResults
 */
export async function batchGeocodeAddresses(addresses: string[]): Promise<GeocodeResult[]> {
  const results = await Promise.all(
    addresses.map(address => geocodeAddress(address))
  )
  return results
}

/**
 * Check if coordinates are valid
 * @param latitude - Latitude value
 * @param longitude - Longitude value
 * @returns true if coordinates are valid
 */
export function isValidCoordinate(latitude: number | null, longitude: number | null): boolean {
  return latitude !== null && 
         longitude !== null && 
         latitude >= -90 && 
         latitude <= 90 && 
         longitude >= -180 && 
         longitude <= 180
}

/**
 * Check if geocoding is stale (older than 30 days)
 * @param geocodedAt - Timestamp when address was geocoded
 * @returns true if geocoding is stale
 */
export function isGeocodingStale(geocodedAt: string | null): boolean {
  if (!geocodedAt) return true
  
  const geocodedDate = new Date(geocodedAt)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  return geocodedDate < thirtyDaysAgo
}
