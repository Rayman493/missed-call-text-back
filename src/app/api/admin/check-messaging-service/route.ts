import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import Twilio from 'twilio'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    // Get user from session
    const cookieStore = await cookies()
    console.log('[SUPABASE SSR SOURCE] admin-check-messaging-service')
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    console.log('[Check Messaging Service] Authorized by user:', user.id)

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Twilio credentials missing' }, { status: 500 })
    }

    console.log('[Check Messaging Service] Checking Messaging Service status')
    console.log('[Check Messaging Service] TWILIO_MESSAGING_SERVICE_SID env var:', messagingServiceSid)

    const client = Twilio(accountSid, authToken)

    // Get Messaging Service details
    if (!messagingServiceSid) {
      return NextResponse.json({
        error: 'TWILIO_MESSAGING_SERVICE_SID not configured',
        messagingServiceSid: null,
        senderPool: []
      })
    }

    try {
      const messagingService = await client.messaging.v1.services(messagingServiceSid).fetch()
      
      // Get sender pool numbers
      const senderPoolNumbers = await client.messaging.v1.services(messagingServiceSid)
        .phoneNumbers
        .list({ limit: 100 })

      const senderPool = senderPoolNumbers.map(pn => ({
        phoneNumber: pn.phoneNumber,
        phoneNumberSid: pn.sid,
        capabilities: pn.capabilities
      }))

      console.log('[Check Messaging Service] Messaging Service SID:', messagingServiceSid)
      console.log('[Check Messaging Service] Sender pool count:', senderPool.length)
      console.log('[Check Messaging Service] Sender pool numbers:', senderPool.map(pn => pn.phoneNumber))

      return NextResponse.json({
        success: true,
        messagingServiceSid: messagingServiceSid,
        messagingServiceFriendlyName: messagingService.friendlyName,
        senderPoolCount: senderPool.length,
        senderPool
      })
    } catch (twilioError: any) {
      console.error('[Check Messaging Service] Twilio error:', twilioError)
      return NextResponse.json({
        error: 'Failed to fetch Messaging Service',
        message: twilioError?.message || 'Unknown error',
        code: twilioError?.code,
        status: twilioError?.status
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[Check Messaging Service] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
