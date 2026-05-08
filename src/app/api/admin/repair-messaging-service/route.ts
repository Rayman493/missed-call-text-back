import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Twilio from 'twilio'

export async function POST(request: Request) {
  try {
    // Verify admin secret
    const body = await request.json()
    const { adminSecret } = body

    if (adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

    if (!accountSid || !authToken || !messagingServiceSid) {
      return NextResponse.json({ error: 'Twilio credentials or Messaging Service SID missing' }, { status: 500 })
    }

    const client = Twilio(accountSid, authToken)

    // Fetch all businesses with Twilio phone numbers
    const { data: businesses, error: businessError } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid, twilio_messaging_service_sid')
      .not('twilio_phone_number_sid', 'is', null)
      .not('twilio_phone_number_sid', 'eq', 'SHARED_MODE')

    if (businessError) {
      return NextResponse.json({ error: businessError.message }, { status: 500 })
    }

    if (!businesses || businesses.length === 0) {
      return NextResponse.json({ message: 'No businesses with Twilio numbers found' })
    }

    console.log('[Repair Messaging Service] Found businesses with Twilio numbers:', businesses.length)

    // Get current sender pool entries
    const existingPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
      .phoneNumbers
      .list({ limit: 100 })

    const existingSids = new Set(existingPhoneNumbers.map(pn => pn.sid))

    let attachedCount = 0
    let alreadyAttachedCount = 0
    let failedCount = 0
    const details = []

    for (const business of businesses) {
      const pnSid = business.twilio_phone_number_sid

      if (!pnSid || pnSid === 'SHARED_MODE') {
        continue
      }

      console.log('[Repair Messaging Service] Checking business:', business.id, 'PN SID:', pnSid)

      if (existingSids.has(pnSid)) {
        console.log('[Repair Messaging Service] Number already attached:', pnSid)
        alreadyAttachedCount++
        details.push({
          businessId: business.id,
          phoneNumberSid: pnSid,
          status: 'already_attached'
        })
      } else {
        try {
          console.log('[Repair Messaging Service] Attaching number:', pnSid)
          
          await client.messaging.v1.services(messagingServiceSid)
            .phoneNumbers
            .create({
              phoneNumberSid: pnSid
            })
          
          console.log('[Repair Messaging Service] Successfully attached:', pnSid)
          attachedCount++
          details.push({
            businessId: business.id,
            phoneNumberSid: pnSid,
            status: 'attached'
          })
        } catch (error) {
          console.error('[Repair Messaging Service] Failed to attach:', pnSid, error)
          failedCount++
          details.push({
            businessId: business.id,
            phoneNumberSid: pnSid,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
    }

    // Verify final sender pool state
    const finalPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
      .phoneNumbers
      .list({ limit: 100 })

    const summary = {
      totalBusinessesChecked: businesses.length,
      alreadyAttached: alreadyAttachedCount,
      attached: attachedCount,
      failed: failedCount,
      finalSenderPoolCount: finalPhoneNumbers.length,
      details
    }

    console.log('[Repair Messaging Service] Summary:', summary)

    return NextResponse.json({ success: true, summary })
  } catch (error) {
    console.error('[Repair Messaging Service] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
