import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      console.error('[Confirm Forwarding Instructions] Missing auth header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract and validate token
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[Confirm Forwarding Instructions] Invalid token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { businessId } = body

    if (!businessId) {
      return NextResponse.json({ error: 'Business ID required' }, { status: 400 })
    }

    // Verify business ownership and fetch current row
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id, forwarding_verified')
      .eq('id', businessId)
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.error('[Confirm Forwarding Instructions] Business lookup failed:', { businessId, userId: user.id, businessError })
      return NextResponse.json({ error: 'Business not found or access denied' }, { status: 404 })
    }

    console.log('[Confirm Forwarding Instructions] Before update:', {
      businessId: business.id,
      userId: user.id,
      forwardingVerifiedBefore: business.forwarding_verified
    })

    // Persist the canonical forwarding-complete state.
    // forwarding_verified is the operational source of truth used by the Dashboard.
    const { data: updatedBusiness, error: updateError } = await supabaseAdmin
      .from('businesses')
      .update({
        forwarding_verified: true,
        forwarding_verified_at: new Date().toISOString(),
        forwarding_instructions_confirmed_at: new Date().toISOString(),
        call_forwarding_enabled: true,
        phone_setup_completed_at: new Date().toISOString()
      })
      .eq('id', businessId)
      .eq('user_id', user.id)
      .select('id, forwarding_verified, forwarding_verified_at, forwarding_instructions_confirmed_at')
      .single()

    if (updateError || !updatedBusiness) {
      console.error('[Confirm Forwarding Instructions] Update failed or matched zero rows:', {
        businessId,
        userId: user.id,
        updateError,
        updatedBusiness
      })
      return NextResponse.json({ error: 'Failed to update forwarding status' }, { status: 500 })
    }

    console.log('[Confirm Forwarding Instructions] After update:', {
      businessId: updatedBusiness.id,
      userId: user.id,
      forwardingVerifiedAfter: updatedBusiness.forwarding_verified,
      forwardingVerifiedAt: updatedBusiness.forwarding_verified_at,
      forwardingInstructionsConfirmedAt: updatedBusiness.forwarding_instructions_confirmed_at
    })

    return NextResponse.json({
      success: true,
      businessId: updatedBusiness.id,
      forwarding_verified: updatedBusiness.forwarding_verified
    })
  } catch (error) {
    console.error('[Confirm Forwarding Instructions] Exception:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
