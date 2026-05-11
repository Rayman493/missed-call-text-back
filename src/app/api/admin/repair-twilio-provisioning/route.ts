import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Twilio from 'twilio'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { business_id, adminSecret } = body

    if (adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Repair Twilio Provisioning] START business_id=', business_id)

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MGe422ac34a7a2b70a646e2084110e54d3'

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Twilio credentials missing' }, { status: 500 })
    }

    const client = Twilio(accountSid, authToken)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Fetch business details
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid, provisioning_status, provisioning_error')
      .eq('id', business_id)
      .single()

    if (businessError || !business) {
      console.error('[Repair Twilio Provisioning] Business not found:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[Repair Twilio Provisioning] Business details:', {
      id: business.id,
      twilio_phone_number: business.twilio_phone_number,
      twilio_phone_number_sid: business.twilio_phone_number_sid,
      provisioning_status: business.provisioning_status,
      provisioning_error: business.provisioning_error
    })

    // If no number SID exists, cannot repair - need full provisioning
    if (!business.twilio_phone_number_sid) {
      console.log('[Repair Twilio Provisioning] No number SID exists, cannot repair')
      return NextResponse.json({ 
        error: 'No number SID exists - need full provisioning',
        needsFullProvisioning: true 
      }, { status: 400 })
    }

    // Verify Twilio number exists
    console.log('[Repair Twilio Provisioning] Verifying Twilio number exists')
    try {
      const twilioNumber = await client.incomingPhoneNumbers(business.twilio_phone_number_sid).fetch()
      console.log('[Repair Twilio Provisioning] Twilio number exists:', twilioNumber.phoneNumber)
    } catch (twilioError) {
      console.error('[Repair Twilio Provisioning] Twilio number not found:', twilioError)
      return NextResponse.json({ error: 'Twilio number not found' }, { status: 404 })
    }

    // Configure voice webhook
    console.log('[Repair Twilio Provisioning] Configuring voice webhook')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
    const voiceWebhookUrl = `${appUrl}/api/twilio/voice`
    const voiceStatusWebhookUrl = `${appUrl}/api/twilio/voice-status`

    try {
      await client.incomingPhoneNumbers(business.twilio_phone_number_sid).update({
        voiceUrl: voiceWebhookUrl,
        voiceMethod: 'POST',
        statusCallback: voiceStatusWebhookUrl,
        statusCallbackMethod: 'POST'
      })
      console.log('[Repair Twilio Provisioning] Voice webhook configured')
    } catch (webhookError) {
      console.error('[Repair Twilio Provisioning] Voice webhook configuration failed:', webhookError)
    }

    // Configure messaging webhook
    console.log('[Repair Twilio Provisioning] Configuring messaging webhook')
    const messagingWebhookUrl = `${appUrl}/api/twilio/incoming-sms`

    try {
      await client.incomingPhoneNumbers(business.twilio_phone_number_sid).update({
        smsUrl: messagingWebhookUrl,
        smsMethod: 'POST'
      })
      console.log('[Repair Twilio Provisioning] Messaging webhook configured')
    } catch (webhookError) {
      console.error('[Repair Twilio Provisioning] Messaging webhook configuration failed:', webhookError)
    }

    // Attach to Messaging Service if missing
    // DISABLED: This repair logic was potentially attaching stale numbers to sender pool
    // Only provisionTwilioNumber() should attach numbers to sender pool
    console.log('[Repair Twilio Provisioning] Skipping Messaging Service attachment to prevent stale number attachment')
    console.log('[Repair Twilio Provisioning] Only provisionTwilioNumber() should attach numbers to sender pool')
    console.log('[Repair Twilio Provisioning] This prevents stale persistence/overwrite logic from attaching wrong numbers')

    // Verify sender pool
    console.log('[Repair Twilio Provisioning] Verifying sender pool')
    try {
      const poolNumbers = await client.messaging.v1.services(messagingServiceSid)
        .phoneNumbers
        .list({ limit: 100 })

      console.log('[Repair Twilio Provisioning] Pool count:', poolNumbers.length)
      console.log('[Repair Twilio Provisioning] Pool numbers:', poolNumbers.map(pn => pn.phoneNumber))

      const numberInPool = poolNumbers.find(pn => pn.sid === business.twilio_phone_number_sid)

      if (!numberInPool) {
        console.error('[Repair Twilio Provisioning] Number NOT in pool after attach')
        return NextResponse.json({ error: 'Number verification failed - not in pool' }, { status: 500 })
      }

      console.log('[Repair Twilio Provisioning] Verification passed - number in pool')
    } catch (verifyError) {
      console.error('[Repair Twilio Provisioning] Verification failed:', verifyError)
      return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
    }

    // Update business provisioning status
    console.log('[Repair Twilio Provisioning] Updating business provisioning status')
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        provisioning_status: 'attached',
        provisioning_error: null,
        provisioned_at: new Date().toISOString()
      })
      .eq('id', business_id)

    if (updateError) {
      console.error('[Repair Twilio Provisioning] Update failed:', updateError)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    console.log('[Repair Twilio Provisioning] STATUS attached')

    return NextResponse.json({
      success: true,
      message: 'Provisioning repaired successfully',
      twilio_phone_number: business.twilio_phone_number,
      twilio_phone_number_sid: business.twilio_phone_number_sid
    })
  } catch (error) {
    console.error('[Repair Twilio Provisioning] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
