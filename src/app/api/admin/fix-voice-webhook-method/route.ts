import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import Twilio from 'twilio'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    // Get user from session
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    console.log('[Fix Voice Webhook Method] Authorized by user:', user.id)
    console.log('[Fix Voice Webhook Method] START - Fixing all voice webhooks to POST')

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Twilio credentials missing' }, { status: 500 })
    }

    const client = Twilio(accountSid, authToken)
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
    const voiceWebhookUrl = `${appUrl}/api/twilio/voice`
    const voiceStatusWebhookUrl = `${appUrl}/api/twilio/voice-status`
    const messagingWebhookUrl = `${appUrl}/api/twilio/incoming-sms`

    console.log('[Fix Voice Webhook Method] Using appUrl:', appUrl)
    console.log('[Fix Voice Webhook Method] Voice webhook URL:', voiceWebhookUrl)

    // Fetch all businesses with Twilio numbers
    const { data: businesses, error: businessesError } = await serviceSupabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid, business_name')
      .not('twilio_phone_number_sid', 'is', null)
      .not('twilio_phone_number', 'is', null)

    if (businessesError) {
      console.error('[Fix Voice Webhook Method] Failed to fetch businesses:', businessesError)
      return NextResponse.json({ error: 'Failed to fetch businesses' }, { status: 500 })
    }

    console.log('[Fix Voice Webhook Method] Found', businesses.length, 'businesses with Twilio numbers')

    const results = {
      total: businesses.length,
      fixed: 0,
      failed: 0,
      errors: [] as any[]
    }

    for (const business of businesses) {
      console.log('[Fix Voice Webhook Method] Processing business:', {
        id: business.id,
        name: business.business_name,
        phone: business.twilio_phone_number,
        sid: business.twilio_phone_number_sid
      })

      try {
        // Update Twilio number webhook configuration
        await client.incomingPhoneNumbers(business.twilio_phone_number_sid).update({
          voiceUrl: voiceWebhookUrl,
          voiceMethod: 'POST',
          statusCallback: voiceStatusWebhookUrl,
          statusCallbackMethod: 'POST',
          smsUrl: messagingWebhookUrl,
          smsMethod: 'POST'
        })

        console.log('[Fix Voice Webhook Method] ✓ Fixed:', business.twilio_phone_number)
        results.fixed++
      } catch (error: any) {
        console.error('[Fix Voice Webhook Method] ✗ Failed:', business.twilio_phone_number, error)
        results.failed++
        results.errors.push({
          businessId: business.id,
          phoneNumber: business.twilio_phone_number,
          error: error.message
        })
      }
    }

    console.log('[Fix Voice Webhook Method] COMPLETE - Results:', results)

    return NextResponse.json({
      success: true,
      message: 'Voice webhook method fix completed',
      results
    })
  } catch (error) {
    console.error('[Fix Voice Webhook Method] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
