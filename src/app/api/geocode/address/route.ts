import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { geocodeAddress, isNonPhysicalLocation } from '@/lib/geocoding'

/**
 * POST /api/geocode/address
 * Geocode an address without requiring a job ID (for calendar events, etc.)
 * Body: { address: string }
 * 
 * Requires authentication - user must be logged in
 */
export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Ignore setAll errors from Server Components
            }
          },
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { address } = body

    if (!address) {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      )
    }

    const normalizedAddress = address.trim()

    if (!normalizedAddress || normalizedAddress.length === 0) {
      return NextResponse.json(
        { error: 'Address is empty' },
        { status: 400 }
      )
    }

    // Limit address length to prevent abuse
    if (normalizedAddress.length > 500) {
      return NextResponse.json(
        { error: 'Address too long (max 500 characters)' },
        { status: 400 }
      )
    }

    // Non-physical locations ("Remote", "Online", "Phone call", …) are a
    // semantic location, not an address — do not send them to Google and do
    // not report a server error. The caller treats this as "not geocodable".
    if (isNonPhysicalLocation(normalizedAddress)) {
      return NextResponse.json(
        { success: false, error: 'Location is not a physical address', code: 'non_physical_location' },
        { status: 200 }
      )
    }

    // Geocode the address
    const result = await geocodeAddress(normalizedAddress)

    if (!result.success) {
      // ZERO_RESULTS / NOT_FOUND are "address did not resolve" outcomes, not
      // server malfunctions — surface them as 422 so clients don't see a 500.
      const googleStatus = (result as any).googleStatus
      const isUnresolved = googleStatus === 'ZERO_RESULTS' || googleStatus === 'NOT_FOUND'
      return NextResponse.json(
        { success: false, error: result.error, code: isUnresolved ? 'address_not_found' : 'geocoding_failed' },
        { status: isUnresolved ? 422 : 500 }
      )
    }

    return NextResponse.json({
      success: true,
      latitude: result.latitude,
      longitude: result.longitude,
      formattedAddress: result.formattedAddress
    })
  } catch (error) {
    console.error('[Geocode Address API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
