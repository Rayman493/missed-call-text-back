import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionTwilioNumber } from '@/lib/twilio'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { business_id } = body

    console.log('[ProvisioningTrigger] ========== TRIGGER PROVISIONING START ==========')
    console.log('[ProvisioningTrigger] business_id:', business_id)
    console.log('[ProvisioningTrigger] Request timestamp:', new Date().toISOString())

    // Generate correlation ID for this provisioning request
    const correlationId = `prov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    console.log('[ProvisioningTrigger] Generated correlation_id:', correlationId)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Fetch business details including lock ID
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, subscription_status, twilio_phone_number, twilio_phone_number_sid, provisioning_status, provisioning_error, provisioning_lock_id')
      .eq('id', business_id)
      .single()

    if (businessError || !business) {
      console.error('[ProvisioningTrigger] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[ProvisioningTrigger] Business state before checks:', {
      business_id: business.id,
      subscription_status: business.subscription_status,
      existing_number: business.twilio_phone_number,
      existing_number_sid: business.twilio_phone_number_sid,
      provisioning_status: business.provisioning_status,
      provisioning_error: business.provisioning_error,
      provisioning_lock_id: business.provisioning_lock_id
    })

    // Check if business is already being provisioned by a different request
    if (business.provisioning_status === 'provisioning' && business.provisioning_lock_id && business.provisioning_lock_id !== correlationId) {
      console.log('[ProvisioningTrigger] Business is already being provisioned by another request')
      console.log('[ProvisioningTrigger] Existing lock_id:', business.provisioning_lock_id)
      console.log('[ProvisioningTrigger] Current correlation_id:', correlationId)
      return NextResponse.json({ 
        error: 'Business is already being provisioned',
        provisioning_status: business.provisioning_status,
        existing_lock_id: business.provisioning_lock_id
      }, { status: 429 }) // Too Many Requests
    }

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

    // Acquire lock by setting provisioning status and lock ID
    await supabase
      .from('businesses')
      .update({ 
        provisioning_status: 'provisioning',
        provisioning_lock_id: correlationId
      })
      .eq('id', business.id)

    console.log('[ProvisioningTrigger] Acquired lock for business:', business.id)
    console.log('[ProvisioningTrigger] Set provisioning_status=provisioning, lock_id=', correlationId)

    // Call provisioning function with correlation ID
    const provisioningResult = await provisionTwilioNumber(business.id, correlationId)

    if (provisioningResult) {
      console.log('[ProvisioningTrigger] Provisioning succeeded:', provisioningResult.phoneNumber)
      console.log('[ProvisioningTrigger] Purchased number from Twilio:', provisioningResult.phoneNumber)
      console.log('[ProvisioningTrigger] Purchased SID from Twilio:', provisioningResult.phoneNumberSid)
      
      // Only save number if messaging service attached
      if (provisioningResult.messagingServiceAttached) {
        // Use saveProvisionedNumberToBusiness helper to ensure correct number is saved
        const { saveProvisionedNumberToBusiness } = await import('@/lib/twilio')
        
        const saveResult = await saveProvisionedNumberToBusiness({
          businessId: business.id,
          phoneNumber: provisioningResult.phoneNumber,
          phoneNumberSid: provisioningResult.phoneNumberSid,
          messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || null
        })
        
        if (!saveResult.success) {
          console.error('[ProvisioningTrigger] Failed to save provisioned number to business')
          await supabase
            .from('businesses')
            .update({
              provisioning_status: 'failed',
              provisioning_error: 'Failed to save provisioned number to business'
            })
            .eq('id', business.id)

          return NextResponse.json({ 
            error: 'Failed to save provisioned number to business',
            provisioning_status: 'failed'
          }, { status: 500 })
        } else {
          console.log('[ProvisioningTrigger] Number saved successfully to business')
          console.log('[ProvisioningTrigger] DB twilio_phone_number:', saveResult.dbNumber)
          console.log('[ProvisioningTrigger] DB twilio_phone_number_sid:', saveResult.dbNumberSid)

          // Clear lock and set active status on success
          await supabase
            .from('businesses')
            .update({
              provisioning_status: 'active',
              provisioning_lock_id: null,
              provisioning_error: null,
              provisioned_at: new Date().toISOString()
            })
            .eq('id', business.id)

          console.log('[ProvisioningTrigger] Cleared lock and set status=active for business:', business.id)

          return NextResponse.json({
            success: true,
            message: 'Provisioning succeeded',
            twilio_phone_number: saveResult.dbNumber,
            twilio_phone_number_sid: saveResult.dbNumberSid
          })
        }
      } else {
        console.error('[ProvisioningTrigger] Messaging Service NOT attached - NOT saving number to business')
        console.error('[ProvisioningTrigger] Error:', provisioningResult.messagingServiceError)
        
        // Clear lock and mark as failed
        await supabase
          .from('businesses')
          .update({
            provisioning_status: 'failed',
            provisioning_lock_id: null,
            provisioning_error: provisioningResult.messagingServiceError || 'Messaging Service attachment failed'
          })
          .eq('id', business.id)

        console.log('[ProvisioningTrigger] Cleared lock and set status=failed for business:', business.id)

        return NextResponse.json({ 
          error: 'Messaging Service attachment failed',
          provisioning_status: 'failed',
          provisioning_error: provisioningResult.messagingServiceError
        }, { status: 500 })
      }
    } else {
      console.error('[ProvisioningTrigger] Provisioning failed - no result returned')
      
      // Clear lock and mark as failed
      await supabase
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_lock_id: null,
          provisioning_error: 'Provisioning failed - no result returned'
        })
        .eq('id', business.id)

      console.log('[ProvisioningTrigger] Cleared lock and set status=failed for business:', business.id)

      return NextResponse.json({ error: 'Provisioning failed - no result returned' }, { status: 500 })
    }
  } catch (error) {
    console.error('[ProvisioningTrigger] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
