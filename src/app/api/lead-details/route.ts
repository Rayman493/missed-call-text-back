import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  console.log("[lead-details API] route hit")
  
  try {
    const searchParams = request.nextUrl.searchParams
    const leadId = searchParams.get('id')

    console.log("[lead-details API] id:", leadId)

    if (!leadId) {
      return NextResponse.json(
        { ok: false, source: "missing_id", error: 'leadId is required' },
        { status: 400 }
      )
    }

    // Simple direct query to debug the issue
    console.log("[lead-details API] querying leads table for id:", leadId)
    
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle()

    console.log("[lead-details API] Supabase result:", { data: lead, error })

    if (error) {
      console.log("[lead-details API] Supabase error:", error)
      return NextResponse.json(
        { ok: false, source: "supabase_error", error: error.message, details: error },
        { status: 500 }
      )
    }

    if (!lead) {
      console.log("[lead-details API] No lead found for id:", leadId)
      return NextResponse.json(
        { ok: false, source: "no_lead_found", id: leadId },
        { status: 404 }
      )
    }

    console.log("[lead-details API] Lead found:", lead)

    // Fetch conversation for this lead
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("lead_id", leadId)
      .maybeSingle()

    console.log("[lead-details API] Conversation found:", conversation?.id || 'none')

    // Fetch messages for this lead (same approach as dashboard)
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })

    console.log("[lead-details API] Messages fetched:", messages?.length || 0, "query method: messages.lead_id")

    // Fetch follow-up jobs for this lead
    const { data: followUpJobs } = await supabaseAdmin
      .from("follow_up_jobs")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })

    // Return enhanced response
    return NextResponse.json({ 
      ok: true, 
      lead: {
        ...lead,
        conversation,
        messages: messages || [],
        followUpJobs: followUpJobs || []
      }
    })
  } catch (error) {
    console.error('Error in lead-details API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
