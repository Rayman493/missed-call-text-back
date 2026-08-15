import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/admin'
import { logAdminAction, getUserEmail } from '@/lib/admin-audit'

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user is admin
    if (!isAdmin(user.id)) {
      return NextResponse.json(
        { ok: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { business_id, business_phone_number } = body

    if (!business_id && !business_phone_number) {
      return NextResponse.json(
        { ok: false, error: 'business_id or business_phone_number is required' },
        { status: 400 }
      )
    }

    console.log('[admin-reset-trial] Resetting trial eligibility for:', { business_id, business_phone_number })

    // Build update query
    const updateData: any = {
      trial_started_at: null,
    }

    // Fetch business before update for audit logging
    let query = supabaseAdmin.from('businesses').select('id, twilio_phone_number, trial_started_at')

    if (business_id) {
      query = query.eq('id', business_id)
    } else if (business_phone_number) {
      query = query.eq('twilio_phone_number', business_phone_number)
    }

    const { data: beforeBusiness, error: fetchError } = await query.single()

    if (fetchError) {
      console.error('[admin-reset-trial] Error fetching business:', fetchError)
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 }
      )
    }

    // Perform update
    let updateQuery = supabaseAdmin.from('businesses').update(updateData)

    if (business_id) {
      updateQuery = updateQuery.eq('id', business_id)
    } else if (business_phone_number) {
      updateQuery = updateQuery.eq('twilio_phone_number', business_phone_number)
    }

    const { data: business, error } = await updateQuery
      .select('id, twilio_phone_number, trial_started_at')
      .single()

    if (error) {
      console.error('[admin-reset-trial] Error resetting trial eligibility:', error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    console.log('[admin-reset-trial] Successfully reset trial eligibility:', business)

    // Audit logging (non-blocking)
    logAdminAction({
      actingAdminUserId: user.id,
      actingAdminEmail: getUserEmail(user),
      action: 'reset_trial_eligibility',
      targetBusinessId: business_id,
      resourceIdentifiers: business?.twilio_phone_number ? { phone_number: business.twilio_phone_number } : undefined,
      beforeState: {
        trial_started_at: beforeBusiness?.trial_started_at,
      },
      afterState: {
        trial_started_at: null,
      },
    })

    return NextResponse.json({
      ok: true,
      business,
      message: 'Trial eligibility reset successfully',
    })
  } catch (error) {
    console.error('[admin-reset-trial] POST error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
