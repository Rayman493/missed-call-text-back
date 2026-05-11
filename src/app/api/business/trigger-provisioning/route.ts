import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionTwilioNumber } from '@/lib/twilio'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { business_id } = body

    console.log('[ProvisioningTrigger] business_id:', business_id)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Fetch business details
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, subscription_status, twilio_phone_number, twilio_phone_number_sid, provisioning_status, provisioning_error')
      .eq('id', business_id)
      .single()

    if (businessError || !business) {
      console.error('[ProvisioningTrigger] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[ProvisioningTrigger] subscription_status:', business.subscription_status)
    console.log('[ProvisioningTrigger] existing number:', business.twilio_phone_number)
    console.log('[ProvisioningTrigger] existing number SID:', business.twilio_phone_number_sid)
    console.log('[ProvisioningTrigger] provisioning_status:', business.provisioning_status)

    // Only trigger provisioning if subscription is trialing or active
    if (business.subscription_status !== 'trialing' && business.subscription_status !== 'active') {
      console.log('[ProvisioningTrigger] Subscription not trialing or active, skipping')
      return NextResponse.json({ 
        error: 'Subscription not trialing or active',
        subscription_status: business.subscription_status
      }, { status: 400 })
    }

    // Only trigger if no number exists or provisioning failed
    if (business.twilio_phone_number && business.provisioning_status === 'attached') {
      console.log('[ProvisioningTrigger] Number already provisioned and attached, skipping')
      return NextResponse.json({ 
        success: true,
        message: 'Number already provisioned and attached',
        twilio_phone_number: business.twilio_phone_number
      })
    }

    // If already provisioning, don't start again
    if (business.provisioning_status === 'provisioning') {
      console.log('[ProvisioningTrigger] Already provisioning, skipping')
      return NextResponse.json({ 
        success: true,
        message: 'Already provisioning',
        provisioning_status: business.provisioning_status
      })
    }

    console.log('[ProvisioningTrigger] START - calling provisionTwilioNumber')

    // Set provisioning status to 'provisioning'
    await supabase
      .from('businesses')
      .update({ provisioning_status: 'provisioning' })
      .eq('id', business.id)

    console.log('[ProvisioningTrigger] Set provisioning_status to provisioning for business:', business.id)

    // Call provisioning function
    const provisioningResult = await provisionTwilioNumber(business.id)

    if (provisioningResult) {
      console.log('[ProvisioningTrigger] Provisioning succeeded:', provisioningResult.phoneNumber)
      
      // Update business with provisioned number ONLY if messaging service attached
      if (provisioningResult.messagingServiceAttached) {
        await supabase
          .from('businesses')
          .update({
            twilio_phone_number: provisioningResult.phoneNumber,
            twilio_phone_number_sid: provisioningResult.phoneNumberSid,
            sms_type: 'a2p_local',
            a2p_status: 'active',
            messaging_status: 'active',
            twilio_messaging_service_sid: process.env.TWILIO_MESSAGING_SERVICE_SID || null,
            provisioning_status: 'attached',
            provisioning_error: null,
            provisioned_at: new Date().toISOString()
          })
          .eq('id', business.id)

        console.log('[ProvisioningTrigger] Business updated with provisioned number and status=attached')

        return NextResponse.json({
          success: true,
          message: 'Provisioning succeeded',
          twilio_phone_number: provisioningResult.phoneNumber,
          twilio_phone_number_sid: provisioningResult.phoneNumberSid
        })
      } else {
        console.error('[ProvisioningTrigger] Messaging Service NOT attached - NOT saving number to business')
        console.error('[ProvisioningTrigger] Error:', provisioningResult.messagingServiceError)
        
        // Mark as failed
        await supabase
          .from('businesses')
          .update({
            provisioning_status: 'failed',
            provisioning_error: provisioningResult.messagingServiceError || 'Messaging Service attachment failed'
          })
          .eq('id', business.id)

        return NextResponse.json({ 
          error: 'Messaging Service attachment failed',
          provisioning_status: 'failed',
          provisioning_error: provisioningResult.messagingServiceError
        }, { status: 500 })
      }
    } else {
      console.error('[ProvisioningTrigger] Provisioning failed - no result returned')
      await supabase
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_error: 'Provisioning failed - no result returned'
        })
        .eq('id', business.id)

      return NextResponse.json({ error: 'Provisioning failed - no result returned' }, { status: 500 })
    }
  } catch (error) {
    console.error('[ProvisioningTrigger] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
