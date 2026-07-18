import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { recoverBusinessWithInvalidTwilioNumber } from '@/lib/twilio-recovery'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { businessId, force } = body

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'Business ID required' }, { status: 400 })
    }

    // Get user from session using server-side client with cookie handling
    const cookieStore = cookies()
    console.log('[SUPABASE SSR SOURCE] admin-reprovision-twilio-number')
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

    console.log('[ADMIN REPROVISION] Reprovisioning Twilio number for business', { businessId, userId: user.id, force })

    // Fetch business details
    const { data: business, error: fetchError } = await supabaseAdmin
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid, provisioning_status')
      .eq('id', businessId)
      .single()

    if (fetchError || !business) {
      console.error('[ADMIN REPROVISION] Failed to fetch business:', fetchError)
      return NextResponse.json({ success: false, error: 'Business not found' }, { status: 404 })
    }

    // If force is true or provisioning_status is needs_reprovision, clear the current Twilio assignment
    if (force || business.provisioning_status === 'needs_reprovision') {
      console.log('[ADMIN REPROVISION] Clearing current Twilio assignment')
      const { error: updateError } = await supabaseAdmin
        .from('businesses')
        .update({
          twilio_phone_number: null,
          twilio_phone_number_sid: null,
          twilio_messaging_service_sid: null,
          provisioning_status: 'provisioning',
          provisioning_error: null,
          forwarding_verified: false,
          call_forwarding_enabled: false,
        })
        .eq('id', businessId)

      if (updateError) {
        console.error('[ADMIN REPROVISION] Failed to clear Twilio assignment:', updateError)
        return NextResponse.json({ success: false, error: 'Failed to clear Twilio assignment' }, { status: 500 })
      }
    }

    // Trigger provisioning
    console.log('[ADMIN REPROVISION] Triggering provisioning')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
    const response = await fetch(`${appUrl}/api/business/trigger-provisioning`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': process.env.PROVISIONING_ADMIN_SECRET || ''
      },
      body: JSON.stringify({ business_id: businessId })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[ADMIN REPROVISION] Failed to trigger provisioning:', errorText)
      return NextResponse.json({ success: false, error: 'Failed to trigger provisioning' }, { status: 500 })
    }

    console.log('[ADMIN REPROVISION] Provisioning triggered successfully', { businessId })

    return NextResponse.json({
      success: true,
      message: 'Twilio number reprovisioning triggered successfully',
      businessId
    })
  } catch (error: any) {
    console.error('[ADMIN REPROVISION] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
