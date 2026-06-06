import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'

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

    // Only delete test/demo data (is_demo = true)
    const { error: leadDeleteError } = await supabase
      .from('leads')
      .delete()
      .eq('business_id', businessId)
      .eq('is_demo', true)

    if (leadDeleteError) {
      console.error('[Admin Clear Test Data] Error deleting test leads:', leadDeleteError)
      return NextResponse.json({ error: 'Failed to delete test leads' }, { status: 500 })
    }

    // Also delete any orphaned messages, call events, and follow-up jobs for demo leads
    // These should cascade delete automatically, but let's be thorough
    const { error: messageDeleteError } = await supabase
      .from('messages')
      .delete()
      .eq('business_id', businessId)
      .neq('lead_id', null) // Only delete messages that had leads
      .lte('created_at', new Date().toISOString()) // Safety check

    if (messageDeleteError) {
      console.error('[Admin Clear Test Data] Error deleting test messages:', messageDeleteError)
      // Continue anyway
    }

    const { error: callEventDeleteError } = await supabase
      .from('call_events')
      .delete()
      .eq('business_id', businessId)
      .neq('lead_id', null) // Only delete call events that had leads
      .lte('created_at', new Date().toISOString()) // Safety check

    if (callEventDeleteError) {
      console.error('[Admin Clear Test Data] Error deleting test call events:', callEventDeleteError)
      // Continue anyway
    }

    const { error: followUpDeleteError } = await supabase
      .from('follow_up_jobs')
      .delete()
      .eq('business_id', businessId)
      .lte('created_at', new Date().toISOString()) // Safety check

    if (followUpDeleteError) {
      console.error('[Admin Clear Test Data] Error deleting test follow-up jobs:', followUpDeleteError)
      // Continue anyway
    }

    console.log('[Admin Clear Test Data] Test data cleared successfully for business:', businessId)

    return NextResponse.json({
      success: true,
      message: 'Test data cleared successfully'
    })
  } catch (error) {
    console.error('[Admin Clear Test Data] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
