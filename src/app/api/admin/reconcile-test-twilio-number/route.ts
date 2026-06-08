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
    const cookieStore = cookies()
    
    // Get user session for auth
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Unauthorized: No session found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { phoneNumber } = body

    if (!phoneNumber) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Missing phoneNumber')
      return NextResponse.json({ error: 'Missing phoneNumber' }, { status: 400 })
    }

    console.log('[RECONCILE TEST TWILIO NUMBER] Reconciling phone:', phoneNumber)

    // Find business with this phone number
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, twilio_phone_number, twilio_phone_number_sid, assigned_twilio_number_id')
      .eq('twilio_phone_number', phoneNumber)
      .single()

    if (businessError || !business) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Business not found for phone:', phoneNumber)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[RECONCILE TEST TWILIO NUMBER] Found business:', business.id, business.name)

    // Check if twilio_numbers row exists
    const { data: existingTwilioNumber, error: twilioError } = await supabase
      .from('twilio_numbers')
      .select('id, business_id, status')
      .eq('phone_number', phoneNumber)
      .maybeSingle()

    if (existingTwilioNumber) {
      console.log('[RECONCILE TEST TWILIO NUMBER] twilio_numbers row already exists:', existingTwilioNumber.id, 'status:', existingTwilioNumber.status)
      
      // Update status to 'active' if it's not already
      if (existingTwilioNumber.status !== 'active' && existingTwilioNumber.status !== 'assigned') {
        console.log('[RECONCILE TEST TWILIO NUMBER] Updating status to active')
        const { error: updateError } = await supabase
          .from('twilio_numbers')
          .update({ status: 'active' })
          .eq('id', existingTwilioNumber.id)

        if (updateError) {
          console.error('[RECONCILE TEST TWILIO NUMBER] Failed to update status:', updateError)
          return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
        }
      }

      // Update businesses.assigned_twilio_number_id if not set
      if (!business.assigned_twilio_number_id || business.assigned_twilio_number_id !== existingTwilioNumber.id) {
        console.log('[RECONCILE TEST TWILIO NUMBER] Updating businesses.assigned_twilio_number_id')
        const { error: updateError } = await supabase
          .from('businesses')
          .update({ assigned_twilio_number_id: existingTwilioNumber.id })
          .eq('id', business.id)

        if (updateError) {
          console.error('[RECONCILE TEST TWILIO NUMBER] Failed to update businesses:', updateError)
          return NextResponse.json({ error: 'Failed to update businesses' }, { status: 500 })
        }
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
    console.log('[RECONCILE TEST TWILIO NUMBER] Creating twilio_numbers row')
    const { data: insertedTwilioNumber, error: insertError } = await supabase
      .from('twilio_numbers')
      .insert({
        business_id: business.id,
        phone_number: business.twilio_phone_number,
        twilio_sid: business.twilio_phone_number_sid,
        number_type: 'both',
        status: 'active',
        sms_status: 'pending',
        provisioning_status: 'ready',
        last_provisioning_attempt_at: new Date().toISOString(),
        assigned_at: new Date().toISOString(),
        campaign_registered_at: new Date().toISOString(),
        sender_pool_attached_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError || !insertedTwilioNumber) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Failed to create twilio_numbers row:', insertError)
      return NextResponse.json({ error: 'Failed to create twilio_numbers row' }, { status: 500 })
    }

    console.log('[RECONCILE TEST TWILIO NUMBER] twilio_numbers row created:', insertedTwilioNumber.id)

    // Update businesses table with assigned_twilio_number_id
    console.log('[RECONCILE TEST TWILIO NUMBER] Updating businesses table')
    const { error: updateError } = await supabase
      .from('businesses')
      .update({ assigned_twilio_number_id: insertedTwilioNumber.id })
      .eq('id', business.id)

    if (updateError) {
      console.error('[RECONCILE TEST TWILIO NUMBER] Failed to update businesses:', updateError)
      return NextResponse.json({ error: 'Failed to update businesses' }, { status: 500 })
    }

    console.log('[RECONCILE TEST TWILIO NUMBER] Reconciliation complete - new row created')
    return NextResponse.json({ 
      success: true, 
      message: 'twilio_numbers row created and linked',
      businessId: business.id,
      twilioNumberId: insertedTwilioNumber.id,
      status: insertedTwilioNumber.status
    })

  } catch (error) {
    console.error('[RECONCILE TEST TWILIO NUMBER] Exception:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
