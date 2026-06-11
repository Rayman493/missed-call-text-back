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

    const body = await request.json()
    const { phoneNumber } = body

    if (!phoneNumber) {
      return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 })
    }

    console.log('[Diagnose Twilio Config] Authorized by user:', user.id)
    console.log('[Diagnose Twilio Config] Phone number:', phoneNumber)

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Twilio credentials missing' }, { status: 500 })
    }

    const client = Twilio(accountSid, authToken)

    // Fetch the phone number from Twilio
    console.log('[Diagnose Twilio Config] Fetching phone number from Twilio...')
    const phoneNumbers = await client.incomingPhoneNumbers.list({ phoneNumber: phoneNumber, limit: 1 })

    if (!phoneNumbers || phoneNumbers.length === 0) {
      return NextResponse.json({ error: 'Phone number not found in Twilio' }, { status: 404 })
    }

    const twilioNumber = phoneNumbers[0]

    console.log('[Diagnose Twilio Config] Phone number found:', twilioNumber.phoneNumber)

    // Log phone number configuration
    const phoneNumberConfig = {
      phoneNumber: twilioNumber.phoneNumber,
      sid: twilioNumber.sid,
      voiceUrl: twilioNumber.voiceUrl,
      voiceMethod: twilioNumber.voiceMethod,
      statusCallback: twilioNumber.statusCallback,
      statusCallbackMethod: twilioNumber.statusCallbackMethod,
      smsUrl: twilioNumber.smsUrl,
      smsMethod: twilioNumber.smsMethod,
      trunkSid: twilioNumber.trunkSid,
      voiceApplicationSid: (twilioNumber as any).voiceApplicationSid,
      smsApplicationSid: twilioNumber.smsApplicationSid,
      emergencyStatus: twilioNumber.emergencyStatus,
      capabilities: twilioNumber.capabilities
    }

    console.log('[Diagnose Twilio Config] Phone number configuration:', JSON.stringify(phoneNumberConfig, null, 2))

    let applicationConfig = null

    // Check if voiceApplicationSid is set (this is the correct property for voice apps)
    const voiceAppSid = (twilioNumber as any).voiceApplicationSid
    if (voiceAppSid) {
      console.log('[Diagnose Twilio Config] Voice Application SID found:', voiceAppSid)
      console.log('[Diagnose Twilio Config] Fetching TwiML Application configuration...')

      try {
        const application = await client.applications(voiceAppSid).fetch()

        applicationConfig = {
          sid: application.sid,
          friendlyName: application.friendlyName,
          voiceUrl: application.voiceUrl,
          voiceMethod: application.voiceMethod,
          voiceFallbackUrl: application.voiceFallbackUrl,
          voiceFallbackMethod: application.voiceFallbackMethod,
          statusCallback: application.statusCallback,
          statusCallbackMethod: application.statusCallbackMethod,
          messageStatusCallback: application.messageStatusCallback
        }

        console.log('[Diagnose Twilio Config] Application configuration:', JSON.stringify(applicationConfig, null, 2))
      } catch (appError: any) {
        console.error('[Diagnose Twilio Config] Failed to fetch application:', appError)
        applicationConfig = { error: appError.message }
      }
    } else {
      console.log('[Diagnose Twilio Config] No Voice Application SID - using phone number level configuration')
    }

    // Determine active voice configuration source
    let activeSource = 'phone_number'
    let activeVoiceUrl = twilioNumber.voiceUrl || ''
    let activeVoiceMethod = twilioNumber.voiceMethod || ''

    if (voiceAppSid && applicationConfig && !applicationConfig.error) {
      activeSource = 'twiml_application'
      activeVoiceUrl = applicationConfig.voiceUrl || ''
      activeVoiceMethod = applicationConfig.voiceMethod || ''
    }

    console.log('[Diagnose Twilio Config] Active voice configuration source:', activeSource)
    console.log('[Diagnose Twilio Config] Active voice URL:', activeVoiceUrl)
    console.log('[Diagnose Twilio Config] Active voice method:', activeVoiceMethod)

    return NextResponse.json({
      success: true,
      phoneNumber: twilioNumber.phoneNumber,
      phoneNumberConfig,
      applicationConfig,
      activeSource,
      activeVoiceUrl,
      activeVoiceMethod,
      recommendation: activeVoiceMethod === 'GET' 
        ? `Update ${activeSource === 'twiml_application' ? 'TwiML Application' : 'Phone Number'} voiceMethod to POST`
        : 'Configuration is correct - using POST method'
    })
  } catch (error) {
    console.error('[Diagnose Twilio Config] Error:', error)
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
