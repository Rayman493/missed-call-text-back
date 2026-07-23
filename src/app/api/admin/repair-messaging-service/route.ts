import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import Twilio from 'twilio'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Generate correlation ID for this repair operation
  const correlationId = `REPAIR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  try {
    // Get user from session
    const cookieStore = await cookies()
    console.log('[SUPABASE SSR SOURCE] admin-repair-messaging-service')
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

    console.log(`[Repair Messaging Service] Authorized by user: ${user.id} correlation_id=${correlationId}`)

    const serviceSupabase = createClient(
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
    const { data: businesses, error: businessError } = await serviceSupabase
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

    console.log(`[Repair Messaging Service] Found businesses with Twilio numbers=${businesses.length} correlation_id=${correlationId}`)

    // Get current sender pool entries
    const existingPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
      .phoneNumbers
      .list({ limit: 100 })

    console.log(`[Repair Messaging Service] Current sender pool count=${existingPhoneNumbers.length} correlation_id=${correlationId}`)
    console.log(`[Repair Messaging Service] Current sender pool numbers=${existingPhoneNumbers.map(pn => pn.phoneNumber)} correlation_id=${correlationId}`)

    const existingSids = new Set(existingPhoneNumbers.map(pn => pn.sid))

    // DISABLED: This repair logic was potentially attaching stale numbers to sender pool
    // Only provisionTwilioNumber() should attach numbers to sender pool
    console.log(`[Repair Messaging Service] SKIPPING sender pool repair to prevent stale number attachment correlation_id=${correlationId}`)
    console.log(`[Repair Messaging Service] Only provisionTwilioNumber() should attach numbers to sender pool correlation_id=${correlationId}`)
    console.log(`[Repair Messaging Service] This prevents stale persistence/overwrite logic from attaching wrong numbers correlation_id=${correlationId}`)
    
    // Return empty results since we're not doing the repair
    return NextResponse.json({
      success: true,
      message: 'Sender pool repair disabled to prevent stale number attachment',
      attachedCount: 0,
      alreadyAttachedCount: existingPhoneNumbers.length,
      failedCount: 0,
      details: []
    })
  } catch (error: any) {
    console.error(`[Repair Messaging Service] Error correlation_id=${correlationId}`, error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}
