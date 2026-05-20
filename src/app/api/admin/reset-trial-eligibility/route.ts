import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user is admin
    if (!user.email?.includes('@replyflowhq.com')) {
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

    let query = supabaseAdmin.from('businesses').update(updateData)

    if (business_id) {
      query = query.eq('id', business_id)
    } else if (business_phone_number) {
      query = query.eq('twilio_phone_number', business_phone_number)
    }

    const { data: business, error } = await query
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
