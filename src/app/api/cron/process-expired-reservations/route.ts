import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Cron job to process expired Twilio number reservations
 * Protected by CRON_SECRET environment variable
 * Runs daily to move expired reservations to available pool
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[EXPIRED RESERVATIONS] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[EXPIRED RESERVATIONS] Unauthorized cron access attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check for dry-run mode
  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === 'true'

  console.log('[EXPIRED RESERVATIONS] Starting cron', { dryRun })

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
    // Find expired reservations
    const { data: expiredReservations, error: fetchError } = await supabase
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, status, reserved_for_business_id, reserved_at, reserved_expires_at, reservation_reason, reserved_owner_email, reserved_business_phone, reserved_stripe_customer_id, reserved_user_id')
      .eq('status', 'reserved')
      .lte('reserved_expires_at', new Date().toISOString())

    if (fetchError) {
      console.error('[EXPIRED RESERVATIONS] Failed to fetch expired reservations:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch expired reservations' }, { status: 500 })
    }

    if (!expiredReservations || expiredReservations.length === 0) {
      console.log('[EXPIRED RESERVATIONS] No expired reservations found')
      return NextResponse.json({
        success: true,
        message: 'No expired reservations found',
        processed: 0,
        returned_to_inventory: 0,
        dryRun
      })
    }

    console.log('[EXPIRED RESERVATIONS] Expired reservations found', { count: expiredReservations.length })

    const results = {
      processed: 0,
      returned_to_inventory: 0,
      failed: 0,
      failedReasons: [] as string[],
      processedNumbers: [] as any[]
    }

    for (const reservation of expiredReservations) {
      results.processed++
      console.log('[EXPIRED RESERVATIONS] Processing expired reservation', {
        id: reservation.id,
        phoneNumber: reservation.phone_number,
        reservedForBusinessId: reservation.reserved_for_business_id,
        reservedAt: reservation.reserved_at,
        reservedExpiresAt: reservation.reserved_expires_at,
        reservationReason: reservation.reservation_reason,
      })

      results.processedNumbers.push({
        id: reservation.id,
        phoneNumber: reservation.phone_number,
        reservedForBusinessId: reservation.reserved_for_business_id,
        reservedExpiresAt: reservation.reserved_expires_at,
      })

      if (dryRun) {
        console.log('[EXPIRED RESERVATIONS] Dry run - would return to inventory')
        results.returned_to_inventory++
        continue
      }

      // Return the number to available pool
      try {
        const { error: updateError } = await supabase
          .from('twilio_numbers')
          .update({
            status: 'available',
            business_id: null,
            reserved_for_business_id: null,
            reserved_at: null,
            reserved_expires_at: null,
            reservation_reason: null,
            reserved_owner_email: null,
            reserved_business_phone: null,
            reserved_stripe_customer_id: null,
            reserved_user_id: null,
            assigned_at: null,
          })
          .eq('id', reservation.id)

        if (updateError) {
          console.error('[EXPIRED RESERVATIONS] Failed to return number to inventory:', updateError)
          results.failed++
          results.failedReasons.push(`Number ${reservation.phone_number}: Update failed`)
          continue
        }

        console.log('[EXPIRED RESERVATIONS] Number returned to inventory successfully', {
          phoneNumber: reservation.phone_number,
          previousReservedForBusinessId: reservation.reserved_for_business_id,
          previousReservedOwnerEmail: reservation.reserved_owner_email,
          previousReservedBusinessPhone: reservation.reserved_business_phone,
          reservationReason: reservation.reservation_reason,
          returnedToInventoryAt: new Date().toISOString(),
        })
        results.returned_to_inventory++
      } catch (error) {
        console.error('[EXPIRED RESERVATIONS] Failed to return number to inventory:', error)
        results.failed++
        results.failedReasons.push(`Number ${reservation.phone_number}: Exception`)
      }
    }

    console.log('[EXPIRED RESERVATIONS] Cron completed', {
      processed: results.processed,
      returned_to_inventory: results.returned_to_inventory,
      failed: results.failed,
      dryRun
    })

    return NextResponse.json({
      success: true,
      message: dryRun ? 'Dry run completed' : 'Cron completed',
      ...results,
      dryRun
    })
  } catch (error: any) {
    console.error('[EXPIRED RESERVATIONS] Cron error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
