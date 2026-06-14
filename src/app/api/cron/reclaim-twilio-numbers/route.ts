import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasActiveManualAccess } from '@/lib/manual-access'

export const dynamic = 'force-dynamic'

// Protected numbers that should never be released
const PROTECTED_TWILIO_NUMBERS = (process.env.PROTECTED_TWILIO_NUMBERS || '').split(',').filter(n => n.trim())

/**
 * Cron job to reclaim Twilio numbers from inactive accounts
 * Protected by CRON_SECRET environment variable
 * Runs daily to release numbers after 30-day grace period
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[TWILIO RECLAIM] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[TWILIO RECLAIM] Unauthorized cron access attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check for dry-run mode
  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === 'true'

  console.log('[TWILIO RECLAIM] Starting cron', { dryRun })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )

  try {
    // Find businesses with scheduled releases that are due
    const { data: businesses, error: fetchError } = await supabase
      .from('businesses')
      .select('*')
      .eq('twilio_release_status', 'scheduled')
      .lte('twilio_release_at', new Date().toISOString())
      .not('twilio_phone_number', 'is', null)

    if (fetchError) {
      console.error('[TWILIO RECLAIM] Failed to fetch candidates:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 })
    }

    if (!businesses || businesses.length === 0) {
      console.log('[TWILIO RECLAIM] No candidates found')
      return NextResponse.json({
        success: true,
        message: 'No candidates found',
        processed: 0,
        released: 0,
        skipped: 0,
        dryRun
      })
    }

    console.log('[TWILIO RECLAIM] Candidates found', { count: businesses.length })

    const results = {
      processed: 0,
      released: 0,
      skipped: 0,
      skippedReasons: [] as string[],
      candidates: [] as any[]
    }

    for (const business of businesses) {
      results.processed++
      console.log('[TWILIO RECLAIM] Processing candidate', {
        businessId: business.id,
        phoneNumber: business.twilio_phone_number,
        releaseAt: business.twilio_release_at
      })

      results.candidates.push({
        businessId: business.id,
        phoneNumber: business.twilio_phone_number,
        releaseAt: business.twilio_release_at
      })

      // Safety check: Verify no active billing access
      const hasActiveSubscription = business.subscription_status === 'active' || business.subscription_status === 'trialing'
      const hasManualAccess = hasActiveManualAccess(business)

      if (hasActiveSubscription) {
        console.log('[TWILIO RECLAIM] Skipped - active subscription restored')
        results.skipped++
        results.skippedReasons.push(`Business ${business.id}: Active subscription restored`)
        
        // Update status to retained
        if (!dryRun) {
          await supabase
            .from('businesses')
            .update({
              twilio_release_at: null,
              twilio_release_status: 'retained',
              twilio_release_reason: 'access_restored_before_release'
            })
            .eq('id', business.id)
        }
        continue
      }

      if (hasManualAccess) {
        console.log('[TWILIO RECLAIM] Skipped - manual access restored')
        results.skipped++
        results.skippedReasons.push(`Business ${business.id}: Manual access restored`)
        
        // Update status to retained
        if (!dryRun) {
          await supabase
            .from('businesses')
            .update({
              twilio_release_at: null,
              twilio_release_status: 'retained',
              twilio_release_reason: 'access_restored_before_release'
            })
            .eq('id', business.id)
        }
        continue
      }

      // Safety check: Verify number is not protected
      if (PROTECTED_TWILIO_NUMBERS.includes(business.twilio_phone_number || '')) {
        console.log('[TWILIO RECLAIM] Skipped - protected number')
        results.skipped++
        results.skippedReasons.push(`Business ${business.id}: Protected number`)
        continue
      }

      // Safety check: Verify number is not shared
      const sharedTollFreeNumber = process.env.MVP_SHARED_TWILIO_NUMBER || '+18336584303'
      if (business.twilio_phone_number === sharedTollFreeNumber) {
        console.log('[TWILIO RECLAIM] Skipped - shared toll-free number')
        results.skipped++
        results.skippedReasons.push(`Business ${business.id}: Shared toll-free number`)
        continue
      }

      // Safety check: Verify number is assigned to this business only
      const { data: otherBusinesses } = await supabase
        .from('businesses')
        .select('id')
        .eq('twilio_phone_number', business.twilio_phone_number)
        .neq('id', business.id)

      if (otherBusinesses && otherBusinesses.length > 0) {
        console.log('[TWILIO RECLAIM] Skipped - number used by another business')
        results.skipped++
        results.skippedReasons.push(`Business ${business.id}: Number used by another business`)
        continue
      }

      if (dryRun) {
        console.log('[TWILIO RECLAIM] Dry run - would release number')
        results.released++
        continue
      }

      // Release the Twilio number
      try {
        console.log('[TWILIO RECLAIM] Reserving number for 30-day grace period', {
          businessId: business.id,
          phoneNumber: business.twilio_phone_number,
          phoneNumberSid: business.twilio_phone_number_sid
        })

        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

        // Get current twilio_number record and user email for logging
        const { data: currentNumber } = await supabase
          .from('twilio_numbers')
          .select('phone_number, status, business_id')
          .eq('business_id', business.id)
          .single()

        // Get user email for stable reclaim key
        let ownerEmail = null
        if (business.user_id) {
          const { data: user } = await supabase.auth.admin.getUserById(business.user_id)
          if (user && user.user && user.user.email) {
            ownerEmail = user.user.email
          }
        }

        // Reserve the number for 30-day grace period
        const { error: reserveError } = await supabase
          .from('twilio_numbers')
          .update({
            status: 'reserved',
            reserved_for_business_id: business.id,
            reserved_at: new Date().toISOString(),
            reserved_expires_at: thirtyDaysFromNow.toISOString(),
            reservation_reason: 'churn_grace_period_expired',
            reserved_owner_email: ownerEmail,
            reserved_business_phone: business.business_phone || business.twilio_phone_number,
            reserved_stripe_customer_id: business.stripe_customer_id,
            reserved_user_id: business.user_id,
            detached_at: new Date().toISOString(),
            detached_reason: 'churn_grace_period_expired',
          })
          .eq('business_id', business.id)

        if (reserveError) {
          console.error('[TWILIO RECLAIM] Failed to reserve Twilio number:', reserveError)
          results.skipped++
          results.skippedReasons.push(`Business ${business.id}: Reserve failed`)
          continue
        }

        // Log the reservation
        console.log('[TWILIO RECLAIM] Twilio number reserved for 30-day grace period', {
          previous_business_id: business.id,
          phone_number: business.twilio_phone_number,
          old_status: currentNumber?.status || 'unknown',
          new_status: 'reserved',
          reserved_for_business_id: business.id,
          reserved_owner_email: ownerEmail,
          reserved_business_phone: business.business_phone || business.twilio_phone_number,
          reserved_stripe_customer_id: business.stripe_customer_id,
          reserved_user_id: business.user_id,
          reserved_at: new Date().toISOString(),
          reserved_expires_at: thirtyDaysFromNow.toISOString(),
          reservation_reason: 'churn_grace_period_expired',
        })

        // Update business record
        const { error: updateError } = await supabase
          .from('businesses')
          .update({
            twilio_phone_number: null,
            twilio_phone_number_sid: null,
            twilio_messaging_service_sid: null,
            provisioning_status: 'released',
            twilio_released_at: new Date().toISOString(),
            twilio_release_status: 'released',
            twilio_release_reason: 'churn_grace_period_expired',
            forwarding_verified: false,
            call_forwarding_enabled: false,
            onboarding_status: 'number_released'
          })
          .eq('id', business.id)

        if (updateError) {
          console.error('[TWILIO RECLAIM] Failed to update business:', updateError)
          results.skipped++
          results.skippedReasons.push(`Business ${business.id}: Update failed`)
          continue
        }

        console.log('[TWILIO RECLAIM] Business updated successfully', { businessId: business.id })
        results.released++
      } catch (error) {
        console.error('[TWILIO RECLAIM] Failed to reserve number:', error)
        results.skipped++
        results.skippedReasons.push(`Business ${business.id}: Reserve failed`)
      }
    }

    console.log('[TWILIO RECLAIM] Cron completed', {
      processed: results.processed,
      released: results.released,
      skipped: results.skipped,
      dryRun
    })

    return NextResponse.json({
      success: true,
      message: dryRun ? 'Dry run completed' : 'Cron completed',
      ...results,
      dryRun
    })
  } catch (error: any) {
    console.error('[TWILIO RECLAIM] Cron error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
