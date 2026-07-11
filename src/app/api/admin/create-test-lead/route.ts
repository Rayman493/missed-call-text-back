import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'
import { LeadService } from '@/lib/services/LeadService'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the user from the request
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    // Get business ID from request body
    const body = await request.json()
    const { businessId } = body

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    // Verify business exists and belongs to user
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (business.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden - Business access denied' }, { status: 403 })
    }

    // Create test lead using LeadService
    const testPhoneNumber = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
    const testContactName = `Test Lead ${new Date().toLocaleTimeString()}`

    // DEFENSIVE GUARD: Log test lead creation with full context
    console.log('[LEAD CREATION ATTEMPT]', {
      source: 'admin-create-test-lead',
      business_id: businessId,
      caller_phone: testPhoneNumber,
      user_id: user.id,
      is_demo: true,
      is_test: true,
      timestamp: new Date().toISOString()
    })

    const lead = await LeadService.createLead({
      business_id: businessId,
      caller_phone: testPhoneNumber,
      status: 'new',
      source: 'admin_test',
      raw_metadata: {
        source: 'admin_test',
        extracted_info: {
          callerName: testContactName
        }
      }
    })

    if (!lead) {
      console.error('[Admin Test Lead] Error creating lead via LeadService')
      return NextResponse.json({ error: 'Failed to create test lead' }, { status: 500 })
    }

    // Create test message
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: lead.id,
        business_id: businessId,
        direction: 'inbound',
        body: 'This is a test message created for UI testing.',
        status: 'delivered',
        created_at: new Date().toISOString(),
      })

    if (messageError) {
      console.error('[Admin Test Lead] Error creating message:', messageError)
      // Still return success even if message creation fails
    }

    // Create test call event
    const { error: callEventError } = await supabase
      .from('call_events')
      .insert({
        lead_id: lead.id,
        business_id: businessId,
        call_sid: `test_call_${Date.now()}`,
        call_status: 'completed',
        call_duration: 30,
        recording_status: 'absent',
        created_at: new Date().toISOString(),
      })

    if (callEventError) {
      console.error('[Admin Test Lead] Error creating call event:', callEventError)
      // Still return success even if call event creation fails
    }

    console.log('[Admin Test Lead] Test lead created successfully:', lead.id)

    return NextResponse.json({
      success: true,
      lead: {
        id: lead.id,
        caller_phone: lead.caller_phone,
        status: lead.status,
      }
    })
  } catch (error) {
    console.error('[Admin Test Lead] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
