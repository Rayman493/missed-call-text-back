import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { geocodeAddress } from '@/lib/geocoding'

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
          setAll() {
            // Not needed for read-only auth check
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

    // Geocode the address
    const result = await geocodeAddress(normalizedAddress)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
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
