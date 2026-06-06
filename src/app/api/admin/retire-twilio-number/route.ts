import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phoneNumber, reason } = body

    if (!phoneNumber) {
      return NextResponse.json({ success: false, error: 'Phone number required' }, { status: 400 })
    }

    // Get user from session using server-side client with cookie handling
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    const isAdminResult = isAdmin(user.id)

    if (!isAdminResult) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    console.log('[ADMIN RETIRE TWILIO] Retiring Twilio number', { phoneNumber, userId: user.id })

    // Check if number exists in twilio_numbers table
    const { data: twilioNumber, error: fetchError } = await supabaseAdmin
      .from('twilio_numbers')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single()

    if (fetchError) {
      console.error('[ADMIN RETIRE TWILIO] Failed to fetch Twilio number:', fetchError)
      return NextResponse.json({ success: false, error: 'Failed to fetch Twilio number' }, { status: 500 })
    }

    if (!twilioNumber) {
      return NextResponse.json({ success: false, error: 'Twilio number not found' }, { status: 404 })
    }

    // Check if number is already retired
    if (twilioNumber.status === 'retired') {
      return NextResponse.json({ success: false, error: 'Number is already retired' }, { status: 400 })
    }

    // Check if number is assigned to a business
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, name, twilio_phone_number, twilio_phone_number_sid')
      .eq('twilio_phone_number', phoneNumber)
      .single()

    console.log('[ADMIN RETIRE TWILIO] Business using number:', business?.id || 'None')

    // Mark number as retired
    const { error: updateError } = await supabaseAdmin
      .from('twilio_numbers')
      .update({
        status: 'retired',
        business_id: null, // Unassign from business
        released_at: new Date().toISOString(),
        last_error: reason || 'Retired by admin'
      })
      .eq('phone_number', phoneNumber)

    if (updateError) {
      console.error('[ADMIN RETIRE TWILIO] Failed to retire number:', updateError)
      return NextResponse.json({ success: false, error: 'Failed to retire number' }, { status: 500 })
    }

    // If number was assigned to a business, clear the Twilio assignment from business
    // but preserve all CRM data
    if (business) {
      console.log('[ADMIN RETIRE TWILIO] Clearing Twilio assignment from business:', business.id)
      const { error: businessUpdateError } = await supabaseAdmin
        .from('businesses')
        .update({
          twilio_phone_number: null,
          twilio_phone_number_sid: null,
          twilio_messaging_service_sid: null,
          provisioning_status: 'needs_reprovision',
          provisioning_error: 'Previous Twilio number was retired',
          forwarding_verified: false,
          call_forwarding_enabled: false,
        })
        .eq('id', business.id)

      if (businessUpdateError) {
        console.error('[ADMIN RETIRE TWILIO] Failed to update business:', businessUpdateError)
        return NextResponse.json({ success: false, error: 'Failed to update business' }, { status: 500 })
      }

      console.log('[ADMIN RETIRE TWILIO] Business updated successfully', { businessId: business.id })
    }

    console.log('[ADMIN RETIRE TWILIO] Number retired successfully', { phoneNumber })

    return NextResponse.json({
      success: true,
      message: 'Twilio number retired successfully',
      phoneNumber,
      businessId: business?.id || null,
      businessName: business?.name || null
    })
  } catch (error: any) {
    console.error('[ADMIN RETIRE TWILIO] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
