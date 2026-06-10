import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkTrialEligibility } from '@/lib/trial-eligibility'

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

    // Parse request body
    const body = await request.json()
    const { business_phone_number, business_email } = body

    if (!business_phone_number) {
      return NextResponse.json(
        { ok: false, error: 'business_phone_number is required' },
        { status: 400 }
      )
    }

    console.log('[trial-eligibility-api] Checking eligibility for:', {
      business_phone_number,
      business_email,
      userId: user.id,
    })

    // Call the shared helper function
    const result = await checkTrialEligibility({
      business_phone_number,
      business_email: business_email || user.email,
      userId: user.id,
      source: 'api_route'
    })

    console.log('[trial-eligibility-api] Eligibility check result:', result)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[trial-eligibility-api] Unexpected error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
