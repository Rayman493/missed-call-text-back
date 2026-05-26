import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic';

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
      console.log("[lead-details API] Authentication failed:", authError)
      return NextResponse.json(
        { ok: false, source: "auth_error", error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.log("[lead-details API] Authenticated user:", user.id)

    // Query lead with RLS protection - user can only access their own leads
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle()

    console.log("[lead-details API] Supabase result:", { data: lead, error })

    if (error) {
      console.log("[lead-details API] Supabase error:", error)
      return NextResponse.json(
        { ok: false, source: "supabase_error", error: error.message },
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

    console.log("[lead-details API] Lead found:", lead.id)

    // Fetch conversation for this lead with RLS protection
    const { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("lead_id", leadId)
      .maybeSingle()

    console.log("[lead-details API] Conversation found:", conversation?.id || 'none')

    // Fetch messages for this lead with RLS protection
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })

    if (messagesError) {
      console.log("[lead-details API] Messages error:", messagesError)
    }

    console.log("[lead-details API] Messages fetched:", messages?.length || 0)

    // Fetch voicemail recordings for this lead with RLS protection
    const { data: voicemailRecordings, error: voicemailError } = await supabase
      .from("voicemail_recordings")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })

    if (voicemailError) {
      console.log("[lead-details API] Voicemail recordings error:", voicemailError)
    }

    console.log("[lead-details API] Voicemail recordings fetched:", voicemailRecordings?.length || 0)

    // Fetch follow-up jobs for this lead with RLS protection
    const { data: followUpJobs } = await supabase
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
        voicemailRecordings: voicemailRecordings || [],
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
