import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase/admin'
import { processInboundSms } from '@/lib/sms-processing'

// Check if dev tools are enabled
function isDevToolsEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true'
  )
}

export async function POST(req: NextRequest) {
  try {
    // Check if dev tools are enabled
    if (!isDevToolsEnabled()) {
      console.error('[Dev Simulation] Dev tools are not enabled')
      return NextResponse.json(
        { error: 'Dev tools are not enabled' },
        { status: 403 }
      )
    }

    // Get authenticated user from session
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    if (!token) {
      console.error('[Dev Simulation] Missing authentication token')
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Verify user session
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      console.error('[Dev Simulation] Invalid authentication token')
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    // Get request body
    const body = await req.json()
    const { conversationId, from, to, messageBody } = body

    if (!conversationId || !from || !to || !messageBody) {
      console.error('[Dev Simulation] Missing required fields')
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, from, to, messageBody' },
        { status: 400 }
      )
    }

    // Verify the conversation belongs to the user's business
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('*, businesses(*)')
      .eq('id', conversationId)
      .single()

    if (conversationError || !conversation) {
      console.error('[Dev Simulation] Conversation not found')
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Verify the conversation belongs to the user's business
    const { data: userBusiness } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!userBusiness || userBusiness.id !== conversation.business_id) {
      console.error('[Dev Simulation] Conversation does not belong to user\'s business')
      return NextResponse.json(
        { error: 'Unauthorized: Conversation does not belong to your business' },
        { status: 403 }
      )
    }

    // Generate a fake MessageSid for simulation
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(7)
    const fakeMessageSid = `SM_DEV_${timestamp}_${random}`

    console.log('[Dev Simulation] Simulating inbound SMS:', {
      conversationId,
      from,
      to,
      messageBody: messageBody.substring(0, 100) + (messageBody.length > 100 ? '...' : ''),
      fakeMessageSid
    })

    // Process the inbound SMS using the shared function
    const result = await processInboundSms({
      messageSid: fakeMessageSid,
      from,
      to,
      body: messageBody,
      source: 'dev_simulation'
    })

    if (!result.success) {
      console.error('[Dev Simulation] Processing failed:', result.error)
      return NextResponse.json(
        { error: result.error || 'Failed to process simulated SMS' },
        { status: 500 }
      )
    }

    console.log('[Dev Simulation] Successfully processed simulated SMS:', {
      leadId: result.lead?.id,
      conversationId: result.conversation?.id,
      messageId: result.message?.id
    })

    return NextResponse.json({
      success: true,
      message: 'Simulated inbound SMS processed successfully',
      leadId: result.lead?.id,
      conversationId: result.conversation?.id,
      messageId: result.message?.id,
      optOut: result.optOut
    })

  } catch (error) {
    console.error('[Dev Simulation] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
