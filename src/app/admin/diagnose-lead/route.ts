import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Normalize phone for comparison
function normalizePhone(phone: string): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '').slice(-10)
}

export async function GET(request: NextRequest) {
  console.log("[DIAGNOSE LEAD] route hit")
  
  try {
    const searchParams = request.nextUrl.searchParams
    const callerPhone = searchParams.get('callerPhone')
    const callSid = searchParams.get('callSid')

    console.log("[DIAGNOSE LEAD] params:", { callerPhone, callSid })

    if (!callerPhone && !callSid) {
      return NextResponse.json(
        { ok: false, error: 'Either callerPhone or callSid is required' },
        { status: 400 }
      )
    }

    // Authenticate user using server-side client with RLS
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log("[DIAGNOSE LEAD] Authentication failed:", authError)
      return NextResponse.json(
        { ok: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.log("[DIAGNOSE LEAD] Authenticated user:", user.id)

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      console.log("[DIAGNOSE LEAD] Business lookup failed:", businessError)
      return NextResponse.json(
        { ok: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    console.log("[DIAGNOSE LEAD] User's business:", business.id)

    const results: any = {
      businessId: business.id,
      businessName: business.name,
      query: { callerPhone, callSid },
      leads: [],
      conversations: [],
      messages: [],
      aiCallRecords: [],
      followUpJobs: [],
      twilioNumber: business.twilio_phone_number
    }

    // Search by caller phone
    if (callerPhone) {
      const normalizedPhone = normalizePhone(callerPhone)
      
      // Find leads matching this phone number for this business
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('business_id', business.id)
        .ilike('caller_phone', `%${normalizedPhone}%`)

      results.leads = leads || []

      // Find conversations for these leads
      if (results.leads.length > 0) {
        const leadIds = results.leads.map((l: any) => l.id)
        const { data: conversations } = await supabaseAdmin
          .from('conversations')
          .select('*')
          .in('lead_id', leadIds)
        results.conversations = conversations || []

        // Find messages for these conversations
        if (results.conversations.length > 0) {
          const conversationIds = results.conversations.map((c: any) => c.id)
          const { data: messages } = await supabaseAdmin
            .from('messages')
            .select('*')
            .in('conversation_id', conversationIds)
          results.messages = messages || []
        }

        // Find messages by lead_id as fallback
        const { data: messagesByLead } = await supabaseAdmin
          .from('messages')
          .select('*')
          .in('lead_id', leadIds)
        
        // Merge messages, avoiding duplicates
        const messageMap = new Map()
        ;(results.messages || []).forEach((m: any) => messageMap.set(m.id, m))
        ;(messagesByLead || []).forEach((m: any) => messageMap.set(m.id, m))
        results.messages = Array.from(messageMap.values())

        // Find AI call records
        const { data: aiCallRecords } = await supabaseAdmin
          .from('ai_call_records')
          .select('*')
          .in('lead_id', leadIds)
        results.aiCallRecords = aiCallRecords || []

        // Find follow-up jobs
        const { data: followUpJobs } = await supabaseAdmin
          .from('follow_up_jobs')
          .select('*')
          .in('lead_id', leadIds)
        results.followUpJobs = followUpJobs || []
      }
    }

    // Search by callSid
    if (callSid) {
      // Find AI call records matching callSid
      const { data: aiCallRecordsBySid } = await supabaseAdmin
        .from('ai_call_records')
        .select('*')
        .eq('call_sid', callSid)

      if (aiCallRecordsBySid && aiCallRecordsBySid.length > 0) {
        results.aiCallRecords = [...results.aiCallRecords, ...aiCallRecordsBySid]
        
        // Get leads from AI call records
        const leadIdsFromAI = aiCallRecordsBySid
          .map((r: any) => r.lead_id)
          .filter((id: any) => id)
        
        if (leadIdsFromAI.length > 0) {
          const { data: leadsFromAI } = await supabaseAdmin
            .from('leads')
            .select('*')
            .in('id', leadIdsFromAI)
          
          // Merge leads, avoiding duplicates
          const leadMap = new Map()
          results.leads.forEach((l: any) => leadMap.set(l.id, l))
          ;(leadsFromAI || []).forEach((l: any) => leadMap.set(l.id, l))
          results.leads = Array.from(leadMap.values())
        }
      }

      // Find call events matching callSid
      const { data: callEvents } = await supabaseAdmin
        .from('call_events')
        .select('*')
        .eq('twilio_call_sid', callSid)
      
      results.callEvents = callEvents || []
    }

    // Check business ownership for each record
    const ownershipCheck = {
      leads: results.leads.map((l: any) => ({
        id: l.id,
        businessId: l.business_id,
        matchesCurrentBusiness: l.business_id === business.id
      })),
      conversations: results.conversations.map((c: any) => ({
        id: c.id,
        businessId: c.business_id,
        matchesCurrentBusiness: c.business_id === business.id
      })),
      messages: results.messages.map((m: any) => ({
        id: m.id,
        businessId: m.business_id,
        matchesCurrentBusiness: m.business_id === business.id
      })),
      aiCallRecords: results.aiCallRecords.map((r: any) => ({
        id: r.id,
        businessId: r.business_id,
        matchesCurrentBusiness: r.business_id === business.id
      }))
    }

    results.ownershipCheck = ownershipCheck

    console.log("[DIAGNOSE LEAD] Results:", {
      leadCount: results.leads.length,
      conversationCount: results.conversations.length,
      messageCount: results.messages.length,
      aiCallRecordCount: results.aiCallRecords.length
    })

    return NextResponse.json({
      ok: true,
      results
    })
  } catch (error) {
    console.error('Error in diagnose-lead API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
