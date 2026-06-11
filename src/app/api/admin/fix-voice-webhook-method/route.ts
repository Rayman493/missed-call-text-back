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

    // Fetch all Twilio numbers from twilio_numbers table (source of truth)
    const { data: twilioNumbers, error: twilioNumbersError } = await serviceSupabase
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, business_id, status')
      .in('status', ['active', 'assigned'])
      .not('twilio_sid', 'is', null)
      .not('phone_number', 'is', null)

    if (twilioNumbersError) {
      console.error('[Fix Voice Webhook Method] Failed to fetch twilio_numbers:', JSON.stringify(twilioNumbersError, null, 2))
      return NextResponse.json({
        error: 'Failed to fetch twilio_numbers',
        details: twilioNumbersError
      }, { status: 500 })
    }

    console.log('[Fix Voice Webhook Method] Found', twilioNumbers.length, 'Twilio numbers to process')

    const results = {
      total: twilioNumbers.length,
      fixed: 0,
      skipped: 0,
      failed: 0,
      errors: [] as any[]
    }

    for (const twilioNumber of twilioNumbers) {
      console.log('[Fix Voice Webhook Method] Processing Twilio number:', {
        id: twilioNumber.id,
        phone: twilioNumber.phone_number,
        sid: twilioNumber.twilio_sid,
        businessId: twilioNumber.business_id,
        status: twilioNumber.status
      })

      try {
        // Fetch current Twilio number configuration
        const currentNumber = await client.incomingPhoneNumbers(twilioNumber.twilio_sid).fetch()

        console.log('[Fix Voice Webhook Method] Current configuration:', {
          voiceUrl: currentNumber.voiceUrl,
          voiceMethod: currentNumber.voiceMethod,
          smsUrl: currentNumber.smsUrl,
          smsMethod: currentNumber.smsMethod
        })

        // Check if already configured correctly
        if (currentNumber.voiceMethod === 'POST' && currentNumber.smsMethod === 'POST') {
          console.log('[Fix Voice Webhook Method] ✓ Already configured with POST - skipping')
          results.skipped++
          continue
        }

        // Update Twilio number webhook configuration
        const updatedNumber = await client.incomingPhoneNumbers(twilioNumber.twilio_sid).update({
          voiceUrl: voiceWebhookUrl,
          voiceMethod: 'POST',
          statusCallback: voiceStatusWebhookUrl,
          statusCallbackMethod: 'POST',
          smsUrl: messagingWebhookUrl,
          smsMethod: 'POST'
        })

        console.log('[Fix Voice Webhook Method] ✓ Fixed:', twilioNumber.phone_number)
        console.log('[Fix Voice Webhook Method] New configuration:', {
          voiceUrl: updatedNumber.voiceUrl,
          voiceMethod: updatedNumber.voiceMethod,
          smsUrl: updatedNumber.smsUrl,
          smsMethod: updatedNumber.smsMethod
        })
        results.fixed++
      } catch (error: any) {
        console.error('[Fix Voice Webhook Method] ✗ Failed:', twilioNumber.phone_number, error)
        results.failed++
        results.errors.push({
          twilioNumberId: twilioNumber.id,
          businessId: twilioNumber.business_id,
          phoneNumber: twilioNumber.phone_number,
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
