import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/supabase/auth-helper'
import { validateBusinessAddress } from '@/lib/validation/business-address'
import { syncTerminalLocation } from '@/lib/terminal/location-sync'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables')
}

const supabaseServiceRole = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      business_id,
      business_address_line1,
      business_address_line2,
      business_address_city,
      business_address_state,
      business_address_postal_code,
      business_address_country
    } = body

    if (!business_id) {
      return NextResponse.json({ error: 'Business ID required' }, { status: 400 })
    }

    // Verify user owns this business
    const { data: business, error: businessError } = await supabaseServiceRole
      .from('businesses')
      .select('id, user_id, stripe_connect_account_id, stripe_terminal_location_id, business_address_line1, business_address_line2, business_address_city, business_address_state, business_address_postal_code, business_address_country')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found or access denied' }, { status: 404 })
    }

    // Capture old address for comparison
    const oldAddress = {
      line1: business.business_address_line1,
      line2: business.business_address_line2,
      city: business.business_address_city,
      state: business.business_address_state,
      postal_code: business.business_address_postal_code,
      country: business.business_address_country
    }

    // Server-side authoritative address validation
    const newAddress = {
      line1: business_address_line1,
      line2: business_address_line2,
      city: business_address_city,
      state: business_address_state,
      postal_code: business_address_postal_code,
      country: business_address_country
    }

    let addressValidation: { valid: boolean; normalized?: any; errors?: any[] } | null = null

    if (newAddress.line1 || newAddress.city || newAddress.state || newAddress.postal_code) {
      addressValidation = validateBusinessAddress({
        line1: newAddress.line1 || '',
        line2: newAddress.line2,
        city: newAddress.city || '',
        state: newAddress.state || '',
        postal_code: newAddress.postal_code || '',
        country: newAddress.country || 'US'
      })

      if (!addressValidation.valid) {
        return NextResponse.json(
          { error: addressValidation.errors?.[0]?.message || 'Invalid address', field: addressValidation.errors?.[0]?.field },
          { status: 400 }
        )
      }
    }

    // Normalize address values
    const normalizedAddress = addressValidation && addressValidation.valid && addressValidation.normalized ? {
      line1: addressValidation.normalized.line1,
      line2: addressValidation.normalized.line2 || null,
      city: addressValidation.normalized.city,
      state: addressValidation.normalized.state,
      postal_code: addressValidation.normalized.postal_code,
      country: addressValidation.normalized.country
    } : newAddress

    // Update canonical address in database
    const { data: updatedBusiness, error: updateError } = await supabaseServiceRole
      .from('businesses')
      .update({
        business_address_line1: normalizedAddress.line1,
        business_address_line2: normalizedAddress.line2,
        business_address_city: normalizedAddress.city,
        business_address_state: normalizedAddress.state,
        business_address_postal_code: normalizedAddress.postal_code,
        business_address_country: normalizedAddress.country
      })
      .eq('id', business_id)
      .select()
      .single()

    if (updateError) {
      console.error('[update-address] Database update failed:', updateError)
      return NextResponse.json({ error: 'Failed to update address' }, { status: 500 })
    }

    // Synchronize Terminal Location if address changed and location exists
    if (business.stripe_connect_account_id && business.stripe_terminal_location_id) {
      const addressChanged = (
        oldAddress.line1 !== normalizedAddress.line1 ||
        oldAddress.line2 !== normalizedAddress.line2 ||
        oldAddress.city !== normalizedAddress.city ||
        oldAddress.state !== normalizedAddress.state ||
        oldAddress.postal_code !== normalizedAddress.postal_code ||
        oldAddress.country !== normalizedAddress.country
      )

      if (addressChanged && normalizedAddress.line1 && normalizedAddress.city && normalizedAddress.state && normalizedAddress.postal_code) {
        console.log('[update-address] Address changed, syncing Terminal Location...')

        const syncResult = await syncTerminalLocation({
          businessId: business.id,
          stripeAccountId: business.stripe_connect_account_id,
          terminalLocationId: business.stripe_terminal_location_id,
          address: normalizedAddress
        })

        if (!syncResult.success) {
          console.warn('[update-address] Terminal Location sync failed:', syncResult.error)
          // Clear the terminal location ID to force recreation on next Tap to Pay
          // This ensures the new canonical address is used instead of the stale location
          await supabaseServiceRole
            .from('businesses')
            .update({ stripe_terminal_location_id: null })
            .eq('id', business_id)

          console.log('[update-address] Cleared terminal location ID to force recreation with new address')
        }
      }
    }

    return NextResponse.json({ success: true, business: updatedBusiness })
  } catch (error: any) {
    console.error('[update-address] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}