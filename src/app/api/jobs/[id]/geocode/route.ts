import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { geocodeAddress, isValidCoordinate, isGeocodingStale } from '@/lib/geocoding'

/**
 * POST /api/jobs/[id]/geocode
 * Geocode a job's service address or customer address from lead metadata
 * Body: { address?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json()
    const { address } = body
    const { id: jobId } = await params

    const supabase = await createServerSupabaseClient()

    // Get the job with business_id for security
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, business_id, service_address, latitude, longitude, geocoded_at, geocoded_address')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Check if user has access to this business's jobs
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify business ownership
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', job.business_id)
      .eq('user_id', user.id)
      .single()

    if (!business) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Use provided address or fall back to job's service_address
    const addressToGeocode = address || job.service_address
    const normalizedAddress = addressToGeocode?.trim()

    // Check if address exists
    if (!normalizedAddress || normalizedAddress.length === 0) {
      return NextResponse.json(
        { error: 'Address is empty' },
        { status: 400 }
      )
    }

    // Check if already geocoded and not stale
    // Use geocoded_address as cache key regardless of address source
    if (isValidCoordinate(job.latitude, job.longitude) && 
        !isGeocodingStale(job.geocoded_at) &&
        job.geocoded_address === normalizedAddress) {
      // Cache hit
      if (process.env.NODE_ENV === 'development') {
        console.log('[GEOCODE_CACHE_HIT]', {
          jobId,
          cachedAddress: job.geocoded_address,
          requestedAddress: normalizedAddress,
          cachedAt: job.geocoded_at
        })
      }
      return NextResponse.json({
        success: true,
        latitude: job.latitude,
        longitude: job.longitude,
        formattedAddress: job.geocoded_address || normalizedAddress,
        cached: true
      })
    }

    // Cache miss - check if address changed
    const addressChanged = job.geocoded_address && job.geocoded_address !== normalizedAddress
    if (addressChanged && process.env.NODE_ENV === 'development') {
      console.log('[GEOCODE_ADDRESS_CHANGED]', {
        jobId,
        oldAddress: job.geocoded_address,
        newAddress: normalizedAddress
      })
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[GEOCODE_CACHE_MISS]', {
        jobId,
        address: normalizedAddress,
        hasCoordinates: isValidCoordinate(job.latitude, job.longitude),
        isStale: isGeocodingStale(job.geocoded_at),
        cachedAddress: job.geocoded_address
      })
    }

    // Geocode the address
    const result = await geocodeAddress(normalizedAddress)

    if (!result.success) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[GEOCODE_FAILED]', {
          jobId,
          address: normalizedAddress,
          error: result.error
        })
      }
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    // Update the job with geocoded coordinates
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        latitude: result.latitude,
        longitude: result.longitude,
        geocoded_at: new Date().toISOString(),
        geocoded_address: result.formattedAddress
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('[Geocode API] Failed to update job:', updateError)
      return NextResponse.json(
        { error: 'Failed to save geocoded coordinates' },
        { status: 500 }
      )
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[GEOCODE_COMPLETED]', {
        jobId,
        address: normalizedAddress,
        formattedAddress: result.formattedAddress,
        latitude: result.latitude,
        longitude: result.longitude
      })
    }

    return NextResponse.json({
      success: true,
      latitude: result.latitude,
      longitude: result.longitude,
      formattedAddress: result.formattedAddress,
      cached: false
    })
  } catch (error) {
    console.error('[Geocode API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
