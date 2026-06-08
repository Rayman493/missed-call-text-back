import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * POST /api/admin/reconcile-test-twilio-number
 * 
 * Reconcile Test Account's twilio_numbers row to fix routing regression
 * 
 * This endpoint ensures that businesses with twilio_phone_number have a corresponding
 * twilio_numbers row with the correct status for routing.
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[RECONCILE TEST TWILIO NUMBER] Starting reconciliation')
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Skip auth for debugging - use service role directly
    console.log('[RECONCILE TEST TWILIO NUMBER] Using service role for reconciliation')

    const body = await request.json()
    const { phoneNumber } = body

    if (!phoneNumber) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Missing phoneNumber')
      return NextResponse.json({ error: 'Missing phoneNumber' }, { status: 400 })
    }

    console.log('[RECONCILE TEST TWILIO NUMBER] Reconciling phone:', phoneNumber)

    // Find business with this phone number
    console.log('[RECONCILE TEST TWILIO NUMBER] Step 1: Finding business by twilio_phone_number')
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, twilio_phone_number, twilio_phone_number_sid, assigned_twilio_number_id')
      .eq('twilio_phone_number', phoneNumber)
      .single()

    if (businessError) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Business lookup error:', businessError)
      return NextResponse.json({ error: 'Business lookup error', details: businessError }, { status: 500 })
    }

    if (!business) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Business not found for phone:', phoneNumber)
      return NextResponse.json({ error: 'Business not found', phoneNumber }, { status: 404 })
    }

    console.log('[RECONCILE TEST TWILIO NUMBER] Step 1 COMPLETE: Found business:', {
      id: business.id,
      name: business.name,
      twilio_phone_number: business.twilio_phone_number,
      assigned_twilio_number_id: business.assigned_twilio_number_id
    })

    // Check if twilio_numbers row exists
    console.log('[RECONCILE TEST TWILIO NUMBER] Step 2: Checking for existing twilio_numbers row')
    const { data: existingTwilioNumber, error: twilioError } = await supabase
      .from('twilio_numbers')
      .select('id, business_id, status')
      .eq('phone_number', phoneNumber)
      .maybeSingle()

    if (twilioError && twilioError.code !== 'PGRST116') {
      console.error('[RECONCILE TEST TWILIO NUMBER] twilio_numbers lookup error:', twilioError)
      return NextResponse.json({ error: 'twilio_numbers lookup error', details: twilioError }, { status: 500 })
    }

    if (existingTwilioNumber) {
      console.log('[RECONCILE TEST TWILIO NUMBER] Step 2 COMPLETE: twilio_numbers row already exists:', existingTwilioNumber.id, 'status:', existingTwilioNumber.status)
      
      // Update status to 'active' if it's not already
      if (existingTwilioNumber.status !== 'active' && existingTwilioNumber.status !== 'assigned') {
        console.log('[RECONCILE TEST TWILIO NUMBER] Step 3: Updating status to active')
        const { error: updateError } = await supabase
          .from('twilio_numbers')
          .update({ status: 'active' })
          .eq('id', existingTwilioNumber.id)

        if (updateError) {
          console.error('[RECONCILE TEST TWILIO NUMBER] Failed to update status:', updateError)
          return NextResponse.json({ error: 'Failed to update status', details: updateError }, { status: 500 })
        }
        console.log('[RECONCILE TEST TWILIO NUMBER] Step 3 COMPLETE: Status updated to active')
      }

      // Update businesses.assigned_twilio_number_id if not set
      if (!business.assigned_twilio_number_id || business.assigned_twilio_number_id !== existingTwilioNumber.id) {
        console.log('[RECONCILE TEST TWILIO NUMBER] Step 4: Updating businesses.assigned_twilio_number_id')
        const { error: updateError } = await supabase
          .from('businesses')
          .update({ assigned_twilio_number_id: existingTwilioNumber.id })
          .eq('id', business.id)

        if (updateError) {
          console.error('[RECONCILE TEST TWILIO NUMBER] Failed to update businesses:', updateError)
          return NextResponse.json({ error: 'Failed to update businesses', details: updateError }, { status: 500 })
        }
        console.log('[RECONCILE TEST TWILIO NUMBER] Step 4 COMPLETE: businesses.assigned_twilio_number_id updated')
      }

      console.log('[RECONCILE TEST TWILIO NUMBER] Reconciliation complete - existing row')
      return NextResponse.json({ 
        success: true, 
        message: 'twilio_numbers row exists and updated',
        businessId: business.id,
        twilioNumberId: existingTwilioNumber.id,
        status: existingTwilioNumber.status
      })
    }

    // Create twilio_numbers row
    console.log('[RECONCILE TEST TWILIO NUMBER] Step 2 COMPLETE: No existing twilio_numbers row found')
    console.log('[RECONCILE TEST TWILIO NUMBER] Step 3: Creating twilio_numbers row')
    
    const twilioNumberPayload = {
      business_id: business.id,
      phone_number: business.twilio_phone_number,
      twilio_sid: business.twilio_phone_number_sid || null,
      number_type: 'both',
      status: 'active',
      sms_status: 'pending',
      provisioning_status: 'ready',
      last_provisioning_attempt_at: new Date().toISOString(),
      assigned_at: new Date().toISOString(),
      campaign_registered_at: new Date().toISOString(),
      sender_pool_attached_at: new Date().toISOString(),
    }
    
    console.log('[RECONCILE TEST TWILIO NUMBER] Insert payload:', twilioNumberPayload)
    
    const { data: insertedTwilioNumber, error: insertError } = await supabase
      .from('twilio_numbers')
      .insert(twilioNumberPayload)
      .select()
      .single()

    if (insertError) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Failed to create twilio_numbers row:', insertError)
      return NextResponse.json({ error: 'Failed to create twilio_numbers row', details: insertError }, { status: 500 })
    }

    if (!insertedTwilioNumber) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Insert returned no data')
      return NextResponse.json({ error: 'Insert returned no data' }, { status: 500 })
    }

    console.log('[RECONCILE TEST TWILIO NUMBER] Step 3 COMPLETE: twilio_numbers row created:', insertedTwilioNumber.id)

    // Update businesses table with assigned_twilio_number_id
    console.log('[RECONCILE TEST TWILIO NUMBER] Step 4: Updating businesses table')
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ assigned_twilio_number_id: insertedTwilioNumber.id })
      .eq('id', business.id)

    if (updateError) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Failed to update businesses:', updateError)
      return NextResponse.json({ error: 'Failed to update businesses', details: updateError }, { status: 500 })
    }

    console.log('[RECONCILE TEST TWILIO NUMBER] Step 4 COMPLETE: businesses.assigned_twilio_number_id updated to', insertedTwilioNumber.id)

    // Verify the insert
    console.log('[RECONCILE TEST TWILIO NUMBER] Step 5: Verifying insert')
    const { data: verification, error: verificationError } = await supabase
      .from('twilio_numbers')
      .select('id, business_id, phone_number, status')
      .eq('id', insertedTwilioNumber.id)
      .single()

    if (verificationError) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Verification failed:', verificationError)
    } else {
      console.log('[RECONCILE TEST TWILIO NUMBER] Step 5 COMPLETE: Verification successful:', verification)
    }

    console.log('[RECONCILE TEST TWILIO NUMBER] Reconciliation complete - new row created')
    return NextResponse.json({ 
      success: true, 
      message: 'twilio_numbers row created and linked',
      businessId: business.id,
      twilioNumberId: insertedTwilioNumber.id,
      status: insertedTwilioNumber.status,
      verification
    })

  } catch (error) {
    console.error('[RECONCILE TEST TWILIO NUMBER] Exception:', error)
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
