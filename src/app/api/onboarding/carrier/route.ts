import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getUserRoleForBusiness } from '@/lib/team-access'

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await request.json()
    const { carrier, businessId, userId, onboardingStatus } = body

    if (!carrier || !businessId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Team Access V1: carrier/provisioning onboarding steps are owner-only.
    const role = await getUserRoleForBusiness(supabase, userId, businessId)
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Only the business owner can complete phone setup' }, { status: 403 })
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Update business with carrier and optionally onboarding status
    const updateData: any = { business_phone_carrier: carrier }
    if (onboardingStatus) {
      updateData.onboarding_status = onboardingStatus
    }

    const { error: updateError } = await supabase
      .from('businesses')
      .update(updateData)
      .eq('id', businessId)

    if (updateError) {
      console.error('[Onboarding Carrier] Update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log('[Onboarding Carrier] Successfully updated carrier and status for business:', businessId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Onboarding Carrier] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
