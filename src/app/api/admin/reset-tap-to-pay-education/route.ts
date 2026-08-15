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
    const { business_id } = body

    if (!business_id) {
      return NextResponse.json(
        { ok: false, error: 'business_id is required' },
        { status: 400 }
      )
    }

    console.log('[admin-reset-tap-to-pay-education] Resetting Tap to Pay education for business:', business_id)

    // Fetch business before update for audit logging
    const { data: beforeBusiness, error: fetchError } = await supabaseAdmin
      .from('businesses')
      .select('id, tap_to_pay_education_completed_at')
      .eq('id', business_id)
      .single()

    if (fetchError) {
      console.error('[admin-reset-tap-to-pay-education] Error fetching business:', fetchError)
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 }
      )
    }

    // Update business to clear education completion
    const { data: business, error } = await supabaseAdmin
      .from('businesses')
      .update({
        tap_to_pay_education_completed_at: null,
      })
      .eq('id', business_id)
      .select('id, tap_to_pay_education_completed_at, tap_to_pay_awareness_acknowledged_at')
      .single()

    if (error) {
      console.error('[admin-reset-tap-to-pay-education] Error resetting education:', error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    console.log('[admin-reset-tap-to-pay-education] Successfully reset Tap to Pay education:', business)

    // Audit logging (non-blocking)
    logAdminAction({
      actingAdminUserId: user.id,
      actingAdminEmail: getUserEmail(user),
      action: 'reset_tap_to_pay_education',
      targetBusinessId: business_id,
      beforeState: {
        tap_to_pay_education_completed_at: beforeBusiness?.tap_to_pay_education_completed_at,
      },
      afterState: {
        tap_to_pay_education_completed_at: null,
      },
    })

    return NextResponse.json({
      ok: true,
      business,
      message: 'Tap to Pay education reset successfully',
    })
  } catch (error) {
    console.error('[admin-reset-tap-to-pay-education] POST error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
