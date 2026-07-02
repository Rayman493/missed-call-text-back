import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      businessPhone,
      businessEmail,
      businessId,
      userId,
      twilioPhoneNumber,
    } = body

    if (!businessPhone || !businessEmail) {
      return NextResponse.json(
        { error: 'Business phone and email are required' },
        { status: 400 }
      )
    }

    // Generate unique confirmation token
    const confirmationToken = crypto.randomBytes(32).toString('hex')

    // Create offboarding tracking record
    const { data: trackingRecord, error: trackingError } = await supabaseAdmin
      .from('offboarding_tracking')
      .insert({
        business_phone_number: businessPhone,
        business_email: businessEmail,
        deletion_timestamp: new Date().toISOString(),
        forwarding_confirmed: false,
        reminder_count: 0,
        confirmation_token: confirmationToken,
        business_id: businessId || null,
        user_id: userId || null,
        twilio_phone_number: twilioPhoneNumber || null,
      })
      .select()
      .single()

    if (trackingError) {
      console.error('[Offboarding Tracking] Failed to create tracking record:', trackingError)
      return NextResponse.json(
        { error: 'Failed to create tracking record', details: trackingError.message },
        { status: 500 }
      )
    }

    console.log('[Offboarding Tracking] Created tracking record:', {
      id: trackingRecord.id,
      businessPhone,
      businessEmail,
      confirmationToken,
    })

    return NextResponse.json({
      success: true,
      trackingId: trackingRecord.id,
      confirmationToken,
    })
  } catch (error) {
    console.error('[Offboarding Tracking] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create tracking record', details: String(error) },
      { status: 500 }
    )
  }
}
