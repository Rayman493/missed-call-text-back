import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionTwilioNumber } from '@/lib/twilio'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

// Simple in-memory rate limiter for provisioning (for production, use Redis)
const provisioningAttempts = new Map<string, number[]>()
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour
const MAX_PROVISIONING_ATTEMPTS = 3 // Max 3 provisioning attempts per business per hour

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  const businessIds = Array.from(provisioningAttempts.keys())
  for (let i = 0; i < businessIds.length; i++) {
    const businessId = businessIds[i]
    const timestamps = provisioningAttempts.get(businessId) || []
    const validTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW)
    if (validTimestamps.length === 0) {
      provisioningAttempts.delete(businessId)
    } else {
      provisioningAttempts.set(businessId, validTimestamps)
    }
  }
}, 5 * 60 * 1000) // Clean up every 5 minutes

export async function POST(request: Request) {
  let business_id: string = ''
  
  try {
    const body = await request.json()
    business_id = body.business_id
    const businessId = business_id // Store in variable for catch block access

    // Rate limiting check
    const now = Date.now()
    const attempts = provisioningAttempts.get(business_id) || []
    const recentAttempts = attempts.filter(ts => now - ts < RATE_LIMIT_WINDOW)
    
    if (recentAttempts.length >= MAX_PROVISIONING_ATTEMPTS) {
      console.error('[ProvisioningTrigger] Rate limit exceeded for business:', business_id)
      return NextResponse.json({ 
        error: 'Too many provisioning attempts',
        retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - recentAttempts[0])) / 1000)
      }, { status: 429 })
    }
    
    // Add this attempt to tracking
    recentAttempts.push(now)
    provisioningAttempts.set(business_id, recentAttempts)

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
      console.error('[ProvisioningTrigger] PostgreSQL error details:', {
        code: businessError?.code,
        message: businessError?.message,
        details: businessError?.details,
        hint: businessError?.hint
      } as any)
      return NextResponse.json({ 
        error: 'Business not found', 
        postgres_error: businessError as any
      }, { status: 404 })
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

    console.log('[ProvisioningTrigger] START - calling provisionTwilioNumber')
    console.log('[ProvisioningTrigger] Business state before provisioning:', {
      business_id: business.id,
      provisioning_status: business.provisioning_status,
      provisioning_lock_id: business.provisioning_lock_id,
      has_number: !!business.twilio_phone_number,
      has_number_sid: !!business.twilio_phone_number_sid
    })

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
    console.log('[ProvisioningTrigger] Calling provisionTwilioNumber with correlation_id:', correlationId)
    const provisioningResult = await provisionTwilioNumber(business.id, correlationId)

    console.log('[ProvisioningTrigger] provisionTwilioNumber result:', {
      success: !!provisioningResult,
      phoneNumber: provisioningResult?.phoneNumber,
      phoneNumberSid: provisioningResult?.phoneNumberSid,
      messagingServiceAttached: provisioningResult?.messagingServiceAttached,
      messagingServiceError: provisioningResult?.messagingServiceError
    })

    // Hard assertion: provisioning result must be valid
    if (!provisioningResult || !provisioningResult.phoneNumber || !provisioningResult.phoneNumberSid) {
      console.error('[ProvisioningTrigger] CRITICAL ERROR: Invalid provisioning result')
      console.error('[ProvisioningTrigger] Expected phoneNumber and phoneNumberSid in result')
      
      // Clear lock and mark as failed
      await supabase
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_lock_id: null,
          provisioning_error: 'Invalid provisioning result returned - missing phoneNumber or phoneNumberSid'
        })
        .eq('id', business.id)

      return NextResponse.json({
        error: 'Provisioning failed - invalid result',
        provisioning_status: 'failed',
        provisioning_error: 'Invalid provisioning result returned - missing phoneNumber or phoneNumberSid'
      }, { status: 500 })
    }

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

      return NextResponse.json({ 
        error: 'Provisioning failed - no result returned',
        provisioning_status: 'failed'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[ProvisioningTrigger] Error:', error)
    
    // Create fresh supabase client for error handling
    const errorSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // businessId is available from outer scope
    
    await errorSupabase
      .from('businesses')
      .update({
        provisioning_status: 'failed',
        provisioning_lock_id: null,
        provisioning_error: 'Internal server error'
      })
      .eq('id', business_id)

    console.log('[ProvisioningTrigger] Cleared lock and set status=failed for business:', business_id)

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
