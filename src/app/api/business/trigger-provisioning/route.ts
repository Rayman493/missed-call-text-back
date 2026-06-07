import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionTwilioNumber } from '@/lib/twilio'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

    console.log('[PROVISIONING FLOW] ===== PROVISIONING ENDPOINT HIT =====')
    console.log('[PROVISIONING FLOW] Request received')
    console.log('[PROVISIONING FLOW] Business ID:', business_id)
    console.log('[PROVISIONING FLOW] Request body:', body)

    // Authenticate user OR webhook via admin secret
    const authHeader = request.headers.get('authorization')
    const adminSecret = request.headers.get('x-admin-secret')
    let userId: string | null = null
    
    console.log('[PROVISIONING AUTH] Checking authentication...')
    console.log('[PROVISIONING AUTH] Auth header present:', !!authHeader)
    console.log('[PROVISIONING AUTH] Admin secret present:', !!adminSecret)
    
    // Detailed secret debugging
    const secretVarName = 'PROVISIONING_ADMIN_SECRET'
    const expectedSecret = process.env.PROVISIONING_ADMIN_SECRET
    const secretExists = !!expectedSecret
    const secretValue = expectedSecret ? '[REDACTED]' : 'NULL'
    
    console.log('[PROVISIONING AUTH] ===== SECRET DEBUGGING =====')
    console.log('[PROVISIONING AUTH] Expected secret variable name:', secretVarName)
    console.log('[PROVISIONING AUTH] Secret variable exists:', secretExists)
    console.log('[PROVISIONING AUTH] Secret variable value:', secretValue)
    console.log('[PROVISIONING AUTH] Header admin secret present:', !!adminSecret)
    console.log('[PROVISIONING AUTH] Header admin secret value:', adminSecret ? '[REDACTED]' : 'NULL')
    console.log('[PROVISIONING AUTH] ===== SECRET DEBUGGING END =====')
    
    if (adminSecret) {
      // Webhook authentication via admin secret
      if (!expectedSecret) {
        console.error('[PROVISIONING AUTH] PROVISIONING_ADMIN_SECRET not configured')
        console.error('[PROVISIONING AUTH] Expected variable:', secretVarName)
        console.error('[PROVISIONING AUTH] Variable exists:', secretExists)
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
      }
      
      if (adminSecret !== expectedSecret) {
        console.error('[PROVISIONING AUTH] Invalid admin secret provided')
        return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
      }
      
      console.log('[PROVISIONING AUTH] ✓ Webhook authenticated via admin secret')
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      // User authentication via Bearer token
      const token = authHeader.split(' ')[1]
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      
      if (authError || !user) {
        console.log('[PROVISIONING AUTH] User auth failed:', authError)
        return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
      }
      
      userId = user.id
      console.log('[PROVISIONING AUTH] ✓ User authenticated:', userId)
    } else {
      console.log('[PROVISIONING AUTH] No authentication provided')
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    console.log('[PROVISIONING AUTH] ✓ Authentication validation result: SUCCESS')

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

    // BETA PROVISIONING: Use server-side admin client to bypass RLS
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id, subscription_status, twilio_phone_number, twilio_phone_number_sid, provisioning_status, provisioning_error, provisioning_lock_id, last_provisioning_attempt_at')
      .eq('id', business_id)
      .single()

    console.log('[PROVISIONING FLOW] Business lookup result:', { business, businessError })

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

    // BETA PROVISIONING: Validate ownership (skip for webhook authentication)
    if (userId && business.user_id !== userId) {
      console.log('[PROVISIONING AUTH] Business does not belong to user')
      console.log('[PROVISIONING AUTH] business.user_id:', business.user_id)
      console.log('[PROVISIONING AUTH] auth user.id:', userId)
      return NextResponse.json({ error: 'Business does not belong to user' }, { status: 403 })
    }
    
    if (userId) {
      console.log('[PROVISIONING AUTH] ✓ Ownership validated for user:', userId)
    } else {
      console.log('[PROVISIONING AUTH] Webhook authentication - ownership check bypassed')
    }

    console.log('[ProvisioningTrigger] Business state before checks:', {
      business_id: business.id,
      user_id: business.user_id,
      subscription_status: business.subscription_status,
      existing_number: business.twilio_phone_number,
      existing_number_sid: business.twilio_phone_number_sid,
      provisioning_status: business.provisioning_status,
      provisioning_error: business.provisioning_error,
      provisioning_lock_id: business.provisioning_lock_id,
      last_provisioning_attempt_at: business.last_provisioning_attempt_at
    })

    // Check for stale provisioning lock (older than 10 minutes)
    const STALE_LOCK_MINUTES = 10
    if (business.provisioning_status === 'provisioning' && business.last_provisioning_attempt_at) {
      const lastAttempt = new Date(business.last_provisioning_attempt_at)
      const minutesSinceAttempt = (Date.now() - lastAttempt.getTime()) / (1000 * 60)

      if (minutesSinceAttempt > STALE_LOCK_MINUTES) {
        console.warn('[ProvisioningTrigger] Stale provisioning lock detected, allowing retry:', {
          business_id: business.id,
          provisioning_status: business.provisioning_status,
          last_provisioning_attempt_at: business.last_provisioning_attempt_at,
          minutes_since_attempt: minutesSinceAttempt,
          stale_lock_threshold_minutes: STALE_LOCK_MINUTES
        })
        // Continue to acquire lock - will overwrite the stale lock
      } else {
        console.warn('[ProvisioningTrigger] Provisioning already in progress, rejecting request:', {
          business_id: business.id,
          provisioning_status: business.provisioning_status,
          last_provisioning_attempt_at: business.last_provisioning_attempt_at,
          minutes_since_attempt: minutesSinceAttempt
        })
        return NextResponse.json({
          error: 'Provisioning already in progress',
          provisioning_status: business.provisioning_status,
          last_provisioning_attempt_at: business.last_provisioning_attempt_at
        }, { status: 409 })
      }
    }

    // Acquire lock by setting provisioning status and lock ID
    await supabaseAdmin
      .from('businesses')
      .update({
        provisioning_status: 'provisioning',
        provisioning_lock_id: correlationId,
        last_provisioning_attempt_at: new Date().toISOString()
      })
      .eq('id', business.id)

    console.log('[ProvisioningTrigger] ✓ Acquired lock for business:', business.id)
    console.log('[ProvisioningTrigger] Set provisioning_status=provisioning, lock_id=', correlationId)

    // Call provisioning function with correlation ID
    console.log('[PROVISIONING FLOW] ===== TWILIO PURCHASE START =====')
    console.log('[PROVISIONING FLOW] Calling provisionTwilioNumber with correlation_id:', correlationId)
    console.log('[PROVISIONING FLOW] Business ID for Twilio purchase:', business.id)
    
    try {
      const provisioningResult = await provisionTwilioNumber(business.id, correlationId)
      
      console.log('[PROVISIONING FLOW] ===== TWILIO PURCHASE RESULT =====')
      console.log('[PROVISIONING FLOW] ✓ Twilio purchase completed')
      console.log('[PROVISIONING FLOW] Provisioning result:', {
        success: !!provisioningResult,
        phoneNumber: provisioningResult?.phoneNumber,
        phoneNumberSid: provisioningResult?.phoneNumberSid,
        messagingServiceAttached: provisioningResult?.messagingServiceAttached,
        messagingServiceError: provisioningResult?.messagingServiceError
      })
      
      if (provisioningResult?.phoneNumber) {
        console.log('[PROVISIONING FLOW] ✓ Phone number purchased:', provisioningResult.phoneNumber)
      }
      
      if (provisioningResult?.phoneNumberSid) {
        console.log('[PROVISIONING FLOW] ✓ Phone number SID obtained:', provisioningResult.phoneNumberSid)
      }
      
      if (provisioningResult?.messagingServiceAttached) {
        console.log('[PROVISIONING FLOW] ✓ Number added to Messaging Service')
      }
      
      if (provisioningResult?.messagingServiceError) {
        console.warn('[PROVISIONING FLOW] ⚠ Messaging Service warning:', provisioningResult.messagingServiceError)
      }

      // Hard assertion: provisioning result must be valid
      if (!provisioningResult || !provisioningResult.phoneNumber || !provisioningResult.phoneNumberSid) {
        console.error('[PROVISIONING FLOW] ✗ CRITICAL ERROR: Invalid provisioning result')
        console.error('[PROVISIONING FLOW] Expected phoneNumber and phoneNumberSid in result')
        
        // Clear lock and mark as failed
        await supabaseAdmin
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

      console.log('[PROVISIONING FLOW] ===== DATABASE SAVE START =====')
      console.log('[PROVISIONING FLOW] ✓ Provisioning succeeded, saving to database...')
      console.log('[PROVISIONING FLOW] Phone number to save:', provisioningResult.phoneNumber)
      console.log('[PROVISIONING FLOW] Phone SID to save:', provisioningResult.phoneNumberSid)
      
      try {
        // Save Twilio phone number and SID to business record
        const { error: saveError } = await supabaseAdmin
          .from('businesses')
          .update({
            twilio_phone_number: provisioningResult.phoneNumber,
            twilio_phone_number_sid: provisioningResult.phoneNumberSid,
            provisioning_status: 'completed',
            provisioning_lock_id: null,
            provisioning_error: null,
            onboarding_status: 'completed' // Advance onboarding
          })
          .eq('id', business.id)

        if (saveError) {
          console.error('[PROVISIONING FLOW] ✗ Database save failed:', saveError)
          console.error('[PROVISIONING FLOW] PostgreSQL error details:', {
            code: saveError.code,
            message: saveError.message,
            details: saveError.details,
            hint: saveError.hint
          })
          
          // Mark as failed due to database error
          await supabaseAdmin
            .from('businesses')
            .update({
              provisioning_status: 'failed',
              provisioning_lock_id: null,
              provisioning_error: `Database save failed: ${saveError.message}`
            })
            .eq('id', business.id)

          return NextResponse.json({
            error: 'Database save failed',
            provisioning_status: 'failed',
            provisioning_error: saveError.message
          }, { status: 500 })
        }

        console.log('[PROVISIONING FLOW] ✓ Database save successful')
        console.log('[PROVISIONING FLOW] ✓ twilio_phone_number saved:', provisioningResult.phoneNumber)
        console.log('[PROVISIONING FLOW] ✓ twilio_phone_number_sid saved:', provisioningResult.phoneNumberSid)
        console.log('[PROVISIONING FLOW] ✓ provisioning_status set to completed')
        console.log('[PROVISIONING FLOW] ✓ onboarding_status advanced to completed')
        
        // Insert into twilio_numbers table for SMS fail-safe
        console.log('[PROVISIONING FLOW] ===== TWILIO_NUMBERS UPSERT START =====')
        console.log('[PROVISIONING FLOW] Inserting into twilio_numbers table for SMS fail-safe')
        console.log('[PROVISIONING FLOW] Business ID:', business.id)
        console.log('[PROVISIONING FLOW] Phone Number:', provisioningResult.phoneNumber)
        console.log('[PROVISIONING FLOW] Phone SID:', provisioningResult.phoneNumberSid)
        
        try {
          const { error: twilioNumbersError } = await supabaseAdmin
            .from('twilio_numbers')
            .upsert({
              twilio_sid: provisioningResult.phoneNumberSid,
              phone_number: provisioningResult.phoneNumber,
              business_id: business.id,
              messaging_service_sid: process.env.TWILIO_MESSAGING_SERVICE_SID || null,
              provisioning_status: 'ready',
              campaign_registered_at: new Date().toISOString(),
              sender_pool_attached_at: provisioningResult.messagingServiceAttached ? new Date().toISOString() : null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'twilio_sid',
              ignoreDuplicates: false
            })

          if (twilioNumbersError) {
            console.error('[PROVISIONING FLOW] ✗ twilio_numbers upsert failed:', twilioNumbersError)
            console.error('[PROVISIONING FLOW] PostgreSQL error details:', {
              code: twilioNumbersError.code,
              message: twilioNumbersError.message,
              details: twilioNumbersError.details,
              hint: twilioNumbersError.hint
            })
            // Don't fail the provisioning, but log the error for monitoring
            console.warn('[PROVISIONING FLOW] ⚠ SMS fail-safe may not work until twilio_numbers row is manually added')
          } else {
            console.log('[PROVISIONING FLOW] ✓ twilio_numbers upsert successful')
            console.log('[PROVISIONING FLOW] ✓ SMS fail-safe will now recognize this number')
          }
        } catch (twilioNumbersUpsertError) {
          console.error('[PROVISIONING FLOW] ✗ twilio_numbers upsert error:', twilioNumbersUpsertError)
          console.warn('[PROVISIONING FLOW] ⚠ SMS fail-safe may not work until twilio_numbers row is manually added')
        }
        
        console.log('[PROVISIONING FLOW] ===== TWILIO_NUMBERS UPSERT END =====')
        console.log('[PROVISIONING FLOW] ===== PROVISIONING FLOW COMPLETE =====')

        return NextResponse.json({
          success: true,
          phoneNumber: provisioningResult.phoneNumber,
          phoneNumberSid: provisioningResult.phoneNumberSid,
          messagingServiceAttached: provisioningResult.messagingServiceAttached,
          provisioning_status: 'completed',
          onboarding_status: 'completed'
        })

      } catch (dbError) {
        console.error('[PROVISIONING FLOW] ✗ Database save error:', dbError)
        
        // Mark as failed due to database error
        await supabaseAdmin
          .from('businesses')
          .update({
            provisioning_status: 'failed',
            provisioning_lock_id: null,
            provisioning_error: `Database save error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
          })
          .eq('id', business.id)

        return NextResponse.json({
          error: 'Database save error',
          provisioning_status: 'failed',
          provisioning_error: dbError instanceof Error ? dbError.message : 'Unknown error'
        }, { status: 500 })
      }

    } catch (twilioError) {
      console.error('[PROVISIONING FLOW] ✗ TWILIO PURCHASE FAILED')
      console.error('[PROVISIONING FLOW] Twilio error details:', {
        name: twilioError instanceof Error ? twilioError.name : 'Unknown',
        message: twilioError instanceof Error ? twilioError.message : 'Unknown error',
        stack: twilioError instanceof Error ? twilioError.stack : 'No stack trace'
      })
      
      // Clear lock and mark as failed
      await supabaseAdmin
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_lock_id: null,
          provisioning_error: `Twilio purchase failed: ${twilioError instanceof Error ? twilioError.message : 'Unknown error'}`
        })
        .eq('id', business.id)

      return NextResponse.json({
        error: 'Twilio purchase failed',
        provisioning_status: 'failed',
        provisioning_error: twilioError instanceof Error ? twilioError.message : 'Unknown error'
      }, { status: 500 })
    }

    console.log('[ProvisioningTrigger] ========== TRIGGER PROVISIONING END ==========')
    return NextResponse.json({
      success: true,
      message: 'Provisioning completed successfully'
    })

  } catch (error) {
    console.error('[ProvisioningTrigger] UNEXPECTED ERROR:', error)
    console.error('[ProvisioningTrigger] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    })
    
    // Clear lock and mark as failed
    if (business_id) {
      await supabaseAdmin
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_lock_id: null,
          provisioning_error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
        })
        .eq('id', business_id)
    }

    return NextResponse.json({
      error: 'Unexpected provisioning error',
      provisioning_status: 'failed',
      provisioning_error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
