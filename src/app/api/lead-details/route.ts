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

    // Fetch media for all messages
    const messageIds = messages?.map(m => m.id) || []
    let messageMediaMap: Record<string, any[]> = {}
    
    if (messageIds.length > 0) {
      try {
        const { data: messageMedia, error: mediaError } = await supabase
          .from("message_media")
          .select("*")
          .in("message_id", messageIds)
          .order("created_at", { ascending: true })

        if (mediaError) {
          console.log("[lead-details API] Media error:", mediaError)
          // Check if table doesn't exist
          if (mediaError.message.includes('does not exist') || mediaError.code === '42P01') {
            console.error('[MMS CRITICAL] message_media table does not exist. Please run migration.')
          }
        } else {
          console.log("[MMS DEBUG] Media rows fetched:", messageMedia?.length || 0)
          // Group media by message_id
          messageMediaMap = (messageMedia || []).reduce((acc: Record<string, any[]>, media: any) => {
            if (!acc[media.message_id]) {
              acc[media.message_id] = []
            }
            acc[media.message_id].push(media)
            return acc
          }, {})
          console.log("[MMS DEBUG] Messages with media:", Object.keys(messageMediaMap).length)
        }
      } catch (error: any) {
        console.error('[lead-details API] Error fetching media:', error)
        // Check if table doesn't exist
        if (error.message?.includes('does not exist') || error.code === '42P01') {
          console.error('[MMS CRITICAL] message_media table does not exist. Please run migration.')
        }
        // Continue without media - don't break the entire API
      }
    }

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

    // Fetch AI call records for this lead with RLS protection
    console.log("[AI DETAILS FETCH START]", {
      leadId: leadId,
      businessId: lead.business_id,
      callerPhone: lead.caller_phone
    })

    let aiCallRecords: any[] | null = null
    let aiCallError: any = null

    // First try by lead_id
    const { data: aiCallRecordsByLead, error: aiCallErrorByLead } = await supabase
      .from("ai_call_records")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })

    console.log("[AI DETAILS FETCH BY LEAD RESULT]", {
      count: aiCallRecordsByLead?.length || 0
    })

    if (!aiCallErrorByLead && aiCallRecordsByLead && aiCallRecordsByLead.length > 0) {
      aiCallRecords = aiCallRecordsByLead
    } else {
      // Fallback to business_id + caller_phone lookup
      console.log("[AI DETAILS FETCH BY PHONE FALLBACK START]")
      const { data: aiCallRecordsByPhone, error: aiCallErrorByPhone } = await supabase
        .from("ai_call_records")
        .select("*")
        .eq("business_id", lead.business_id)
        .eq("caller_phone", lead.caller_phone)
        .order("created_at", { ascending: false })

      console.log("[AI DETAILS FETCH BY PHONE FALLBACK RESULT]", {
        count: aiCallRecordsByPhone?.length || 0,
        error: aiCallErrorByPhone?.message || 'none'
      })

      if (!aiCallErrorByPhone) {
        aiCallRecords = aiCallRecordsByPhone
        aiCallError = null
      } else {
        aiCallError = aiCallErrorByPhone
      }
    }

    if (aiCallRecords && aiCallRecords.length > 0) {
      console.log("[AI DETAILS SELECTED RECORD]", {
        recordId: aiCallRecords[0].id,
        summaryExists: !!aiCallRecords[0].summary,
        extractedInfoExists: !!aiCallRecords[0].extracted_info
      })
    }

    // Fetch follow-up jobs for this lead with RLS protection
    const { data: followUpJobs } = await supabase
      .from("follow_up_jobs")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })

    // Attach media to messages
    const messagesWithMedia = (messages || []).map(message => ({
      ...message,
      media: messageMediaMap[message.id] || []
    }))

    console.log("[MMS DEBUG] Messages with media after attachment:", 
      messagesWithMedia.filter(m => m.media && m.media.length > 0).length)

    // Return enhanced response
    return NextResponse.json({
      ok: true,
      lead: {
        ...lead,
        conversation,
        messages: messagesWithMedia,
        voicemailRecordings: voicemailRecordings || [],
        followUpJobs: followUpJobs || [],
        aiCallRecords: aiCallRecords || []
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
