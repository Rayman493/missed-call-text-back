import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { geocodeAddress, isValidCoordinate, isGeocodingStale } from '@/lib/geocoding'

/**
 * POST /api/geocode
 * Geocode a job's service address
 * Body: { jobId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { jobId } = body

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

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

    // Check if address exists
    if (!job.service_address || job.service_address.trim().length === 0) {
      return NextResponse.json(
        { error: 'Service address is empty' },
        { status: 400 }
      )
    }

    // Check if already geocoded and not stale
    if (isValidCoordinate(job.latitude, job.longitude) && 
        !isGeocodingStale(job.geocoded_at) &&
        job.geocoded_address === job.service_address.trim()) {
      return NextResponse.json({
        success: true,
        latitude: job.latitude,
        longitude: job.longitude,
        formattedAddress: job.geocoded_address || job.service_address,
        cached: true
      })
    }

    // Geocode the address
    const result = await geocodeAddress(job.service_address)

    if (!result.success) {
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
