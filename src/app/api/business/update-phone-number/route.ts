import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const COOLDOWN_DAYS = 7

/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')

  // Check if it's a valid US/Canada number (10 or 11 digits)
  if (digits.length === 10) {
    return `+1${digits}`
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  return null
}

/**
 * Validate phone number
 */
function validatePhoneNumber(phone: string): { valid: boolean; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' }
  }

  const trimmed = phone.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: 'Phone number cannot be blank' }
  }

  const normalized = normalizePhoneNumber(trimmed)
  if (!normalized) {
    return { valid: false, error: 'Invalid phone number format' }
  }

  return { valid: true }
}

/**
 * Check if phone number change is within cooldown period
 */
function isInCooldown(lastChangedAt: string | null): boolean {
  if (!lastChangedAt) return false

  const lastChanged = new Date(lastChangedAt)
  const now = new Date()
  const cooldownEnd = new Date(lastChanged)
  cooldownEnd.setDate(cooldownEnd.getDate() + COOLDOWN_DAYS)

  return now < cooldownEnd
}

/**
 * Get next available change date
 */
function getNextAvailableChangeDate(lastChangedAt: string | null): string | null {
  if (!lastChangedAt) return null

  const lastChanged = new Date(lastChangedAt)
  const cooldownEnd = new Date(lastChanged)
  cooldownEnd.setDate(cooldownEnd.getDate() + COOLDOWN_DAYS)

  return cooldownEnd.toISOString()
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[update-phone-number] Authentication failed:', authError)
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { businessId, phoneNumber } = body

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      )
    }

    // Validate phone number
    const validation = validatePhoneNumber(phoneNumber)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber)

    // Fetch current business data
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      console.error('[update-phone-number] Failed to fetch business:', businessError)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    // Verify user owns this business
    if (business.user_id !== user.id) {
      console.error('[update-phone-number] User does not own business:', {
        userId: user.id,
        businessId: business.id,
        businessUserId: business.user_id
      })
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Check if new number is the same as current
    const currentNormalized = business.business_phone_number ? normalizePhoneNumber(business.business_phone_number) : null
    if (currentNormalized === normalizedPhone) {
      return NextResponse.json(
        { error: 'New phone number is the same as the current number' },
        { status: 400 }
      )
    }

    // Check cooldown
    if (isInCooldown(business.business_phone_changed_at)) {
      const nextAvailable = getNextAvailableChangeDate(business.business_phone_changed_at)
      return NextResponse.json(
        { 
          error: 'Phone number change is on cooldown',
          nextAvailableChangeDate: nextAvailable,
          cooldownDays: COOLDOWN_DAYS
        },
        { status: 429 }
      )
    }

    // Update business phone number and reset forwarding verification
    const { error: updateError } = await supabaseAdmin
      .from('businesses')
      .update({
        business_phone_number: normalizedPhone,
        business_phone_changed_at: new Date().toISOString(),
        forwarding_verified: false,
        call_forwarding_enabled: false,
        phone_setup_completed_at: null
      })
      .eq('id', businessId)

    if (updateError) {
      console.error('[update-phone-number] Failed to update business phone:', updateError)
      return NextResponse.json(
        { error: 'Failed to update phone number' },
        { status: 500 }
      )
    }

    console.log('[update-phone-number] Phone number updated successfully', {
      businessId,
      userId: user.id,
      oldPhone: business.business_phone_number,
      newPhone: normalizedPhone
    })

    return NextResponse.json({
      success: true,
      phoneNumber: normalizedPhone,
      changedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('[update-phone-number] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to check cooldown status
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      )
    }

    // Fetch business data
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('business_phone_changed_at, business_phone_number, user_id')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    // Verify user owns this business
    if (business.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const inCooldown = isInCooldown(business.business_phone_changed_at)
    const nextAvailable = getNextAvailableChangeDate(business.business_phone_changed_at)

    return NextResponse.json({
      inCooldown,
      nextAvailableChangeDate: nextAvailable,
      lastChangedAt: business.business_phone_changed_at,
      currentPhoneNumber: business.business_phone_number
    })
  } catch (error) {
    console.error('[update-phone-number] GET error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
