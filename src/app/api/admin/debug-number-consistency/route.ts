import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  console.log('[Debug Number Consistency] route hit')

  try {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('[Debug Number Consistency] Auth error:', authError)
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get business for user
    const lookupResult = await db.getBusinessByUserId(user.id)
    if (!lookupResult.business || lookupResult.errorType !== 'none') {
      return NextResponse.json(
        { error: 'Business not found', errorType: lookupResult.errorType },
        { status: 404 }
      )
    }

    const business = lookupResult.business
    console.log('[Debug Number Consistency] business_id:', business.id)
    console.log('[Debug Number Consistency] DB twilio_phone_number:', business.twilio_phone_number)
    console.log('[Debug Number Consistency] DB twilio_phone_number_sid:', business.twilio_phone_number_sid)
    console.log('[Debug Number Consistency] DB provisioning_status:', business.provisioning_status)

    // Get Twilio client
    const Twilio = require('twilio')
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MGe422ac34a7a2b70a646e2084110e54d3'

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { 
          error: 'Twilio credentials missing',
          db_number: business.twilio_phone_number,
          db_number_sid: business.twilio_phone_number_sid,
          provisioning_status: business.provisioning_status
        },
        { status: 500 }
      )
    }

    const client = Twilio(accountSid, authToken)

    // Get sender pool numbers
    const senderPool = await client.messaging.v1.services(messagingServiceSid)
      .phoneNumbers
      .list({ limit: 100 })

    console.log('[Debug Number Consistency] Sender pool count:', senderPool.length)
    console.log('[Debug Number Consistency] Sender pool numbers:', senderPool.map((pn: any) => pn.phoneNumber))
    console.log('[Debug Number Consistency] Sender pool SIDs:', senderPool.map((pn: any) => pn.sid))

    // Check if business SID is in sender pool
    const numberInPool = business.twilio_phone_number_sid 
      ? senderPool.find((pn: any) => pn.sid === business.twilio_phone_number_sid)
      : null

    console.log('[Debug Number Consistency] Business SID in pool:', !!numberInPool)
    if (numberInPool) {
      console.log('[Debug Number Consistency] Pool number for business SID:', numberInPool.phoneNumber)
    }

    // Get purchased number from Twilio if SID exists
    let purchasedNumber = null
    if (business.twilio_phone_number_sid) {
      try {
        const twilioNumber = await client.incomingPhoneNumbers(business.twilio_phone_number_sid).fetch()
        purchasedNumber = twilioNumber.phoneNumber
        console.log('[Debug Number Consistency] Purchased number from Twilio:', purchasedNumber)
      } catch (error) {
        console.error('[Debug Number Consistency] Error fetching purchased number:', error)
      }
    }

    const response = {
      business_id: business.id,
      db_number: business.twilio_phone_number,
      db_number_sid: business.twilio_phone_number_sid,
      provisioning_status: business.provisioning_status,
      purchased_number_from_twilio: purchasedNumber,
      sender_pool_numbers: senderPool.map((pn: any) => pn.phoneNumber),
      sender_pool_sids: senderPool.map((pn: any) => pn.sid),
      business_sid_in_pool: !!numberInPool,
      pool_number_for_business_sid: numberInPool?.phoneNumber || null,
      numbers_match: purchasedNumber === business.twilio_phone_number,
      consistency_status: purchasedNumber === business.twilio_phone_number ? 'MATCH' : 'MISMATCH'
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Debug Number Consistency] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
