import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { validateTwilioNumberLifecycleMutation, maskPhoneNumber } from '@/lib/twilio-lifecycle-validator'
import { logAdminAction, getUserEmail } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phoneNumber, reason } = body

    if (!phoneNumber) {
      return NextResponse.json({ success: false, error: 'Phone number required' }, { status: 400 })
    }

    // Get user from session using server-side client with cookie handling
    const cookieStore = await cookies()
    console.log('[SUPABASE SSR SOURCE] admin-retire-twilio-number')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
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
      .select('id, name, user_id, twilio_phone_number, twilio_phone_number_sid, subscription_status, is_protected_account, protected_reason, manual_access_granted_by, manual_access_granted_at, assigned_twilio_number_id')
      .eq('twilio_phone_number', phoneNumber)
      .single()

    console.log('[ADMIN RETIRE TWILIO] Business using number:', business?.id || 'None')

    // P0 FIX 2: If number is assigned to a business, validate lifecycle mutation
    if (business) {
      console.log('[ADMIN RETIRE TWILIO] Number is assigned to business - performing lifecycle validation')
      const validation = await validateTwilioNumberLifecycleMutation({
        businessId: business.id,
        phoneNumber: phoneNumber,
        phoneNumberSid: twilioNumber.twilio_sid,
        operation: 'retire'
      })

      if (!validation.valid) {
        console.error('[ADMIN RETIRE TWILIO] LIFECYCLE VALIDATION FAILED:', validation.error)
        console.error('[ADMIN RETIRE TWILIO] Validation error type:', validation.errorType)
        console.error('[ADMIN RETIRE TWILIO] Validation details:', validation.details)
        
        // Return 409 Conflict for subscription/protected account issues
        if (validation.errorType === 'subscription_active' || validation.errorType === 'protected_account') {
          return NextResponse.json(
            {
              success: false,
              error: validation.error,
              errorType: validation.errorType,
              details: validation.details
            },
            { status: 409 }
          )
        }

        // Return 400 for other validation errors
        return NextResponse.json(
          {
            success: false,
            error: validation.error,
            errorType: validation.errorType,
            details: validation.details
          },
          { status: 400 }
        )
      }
    }

    // P0 FIX 2: Fetch current state for compare-and-swap
    const previousStatus = twilioNumber.status
    const previousBusinessId = twilioNumber.business_id
    const previousLastError = twilioNumber.last_error
    const previousReleasedAt = twilioNumber.released_at
    const previousDetachedAt = twilioNumber.detached_at
    const previousDetachedReason = twilioNumber.detached_reason

    // P0 FIX 2: Mark number as retired with compare-and-swap
    const { error: updateError, count: updateCount } = await supabaseAdmin
      .from('twilio_numbers')
      .update({
        status: 'retired',
        business_id: null, // Unassign from business
        released_at: new Date().toISOString(),
        last_error: reason || 'Retired by admin',
        detached_at: new Date().toISOString(),
        detached_reason: reason || 'admin_retired'
      })
      .eq('id', twilioNumber.id)
      .eq('status', previousStatus)
      .eq('business_id', previousBusinessId)

    if (updateError) {
      console.error('[ADMIN RETIRE TWILIO] Failed to retire number:', updateError)
      return NextResponse.json({ success: false, error: 'Failed to retire number' }, { status: 500 })
    }

    if (updateCount === 0) {
      console.error('[ADMIN RETIRE TWILIO] Compare-and-swap failed - zero rows updated')
      return NextResponse.json(
        { success: false, error: 'Concurrent modification detected - please retry' },
        { status: 409 }
      )
    }

    // P0 FIX 2: If number was assigned to a business, clear the Twilio assignment from business
    // with compare-and-swap and atomic compensation
    if (business) {
      console.log('[ADMIN RETIRE TWILIO] Clearing Twilio assignment from business:', business.id)
      const { error: businessUpdateError, count: businessUpdateCount } = await supabaseAdmin
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
        .eq('twilio_phone_number', phoneNumber)
        .eq('twilio_phone_number_sid', twilioNumber.twilio_sid)

      if (businessUpdateError) {
        console.error('[ADMIN RETIRE TWILIO] Failed to update business:', businessUpdateError)

        // SAFETY FIX: Compensation rollback with compare-and-swap and full field restoration
        console.error('[ADMIN RETIRE TWILIO] COMPENSATION: Rolling back twilio_numbers update')
        const { error: rollbackError, count: rollbackCount } = await supabaseAdmin
          .from('twilio_numbers')
          .update({
            status: previousStatus,
            business_id: previousBusinessId,
            last_error: previousLastError,
            released_at: previousReleasedAt,
            detached_at: previousDetachedAt,
            detached_reason: previousDetachedReason
          })
          .eq('id', twilioNumber.id)
          .eq('status', 'retired') // Ensure we're rolling back from the retired state
          .eq('business_id', null)

        if (rollbackError || rollbackCount === 0) {
          console.error('[ADMIN RETIRE TWILIO] CRITICAL: Compensation rollback failed - data may be inconsistent', {
            rollbackError: rollbackError?.message,
            rollbackCount
          })
          return NextResponse.json(
            { success: false, error: 'CRITICAL: Failed to update business AND compensation rollback failed - data may be inconsistent' },
            { status: 500 }
          )
        }

        console.error('[ADMIN RETIRE TWILIO] COMPENSATION: Rollback successful')
        return NextResponse.json(
          { success: false, error: 'Failed to update business - transaction rolled back' },
          { status: 500 }
        )
      }

      if (businessUpdateCount === 0) {
        console.error('[ADMIN RETIRE TWILIO] Compare-and-swap failed on business update')

        // SAFETY FIX: Compensation rollback with compare-and-swap and full field restoration
        console.error('[ADMIN RETIRE TWILIO] COMPENSATION: Rolling back twilio_numbers update')
        const { error: rollbackError, count: rollbackCount } = await supabaseAdmin
          .from('twilio_numbers')
          .update({
            status: previousStatus,
            business_id: previousBusinessId,
            last_error: previousLastError,
            released_at: previousReleasedAt,
            detached_at: previousDetachedAt,
            detached_reason: previousDetachedReason
          })
          .eq('id', twilioNumber.id)
          .eq('status', 'retired') // Ensure we're rolling back from the retired state
          .eq('business_id', null)

        if (rollbackError || rollbackCount === 0) {
          console.error('[ADMIN RETIRE TWILIO] CRITICAL: Compensation rollback failed - data may be inconsistent', {
            rollbackError: rollbackError?.message,
            rollbackCount
          })
          return NextResponse.json(
            { success: false, error: 'CRITICAL: Compare-and-swap failed AND compensation rollback failed - data may be inconsistent' },
            { status: 500 }
          )
        }

        console.error('[ADMIN RETIRE TWILIO] COMPENSATION: Rollback successful')
        return NextResponse.json(
          { success: false, error: 'Concurrent modification detected - please retry' },
          { status: 409 }
        )
      }

      console.log('[ADMIN RETIRE TWILIO] Business updated successfully', { businessId: business.id })
    }

    // P0 FIX 2: Emit audit event
    console.log('[ADMIN RETIRE TWILIO] Emitting audit event')
    logAdminAction({
      actingAdminUserId: user.id,
      actingAdminEmail: getUserEmail(user),
      action: 'retire_twilio_number',
      targetBusinessId: business?.id,
      targetUserId: business?.user_id,
      resourceIdentifiers: {
        business_name: business?.name,
        twilio_number_id: twilioNumber.id,
        masked_phone_number: maskPhoneNumber(phoneNumber),
      },
      beforeState: {
        previous_status: previousStatus,
        previous_business_id: previousBusinessId,
      },
      afterState: {
        new_status: 'retired',
        new_business_id: null,
      },
      metadata: {
        reason: reason || 'Admin retirement',
        twilio_number_sid: twilioNumber.sid,
        subscription_status: business?.subscription_status,
        is_protected_account: business?.is_protected_account,
        protected_reason: business?.protected_reason,
        deployment_version: process.env.VERCEL_GIT_COMMIT_SHA,
      },
    })

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
