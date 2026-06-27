import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic';

// Normalize phone for comparison
function normalizePhone(phone: string): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '').slice(-10)
}

export async function GET(request: NextRequest) {
  
  try {
    const searchParams = request.nextUrl.searchParams
    const leadId = searchParams.get('id')

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
      return NextResponse.json(
        { ok: false, source: "auth_error", error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Query lead with RLS protection - user can only access their own leads
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { ok: false, source: "supabase_error", error: error.message },
        { status: 500 }
      )
    }

    if (!lead) {
      return NextResponse.json(
        { ok: false, source: "no_lead_found", id: leadId },
        { status: 404 }
      )
    }

    // Fetch conversation for this lead with RLS protection
    const { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("lead_id", leadId)
      .eq("business_id", lead.business_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fetch messages by lead_id to ensure all messages for the lead are visible
    // regardless of conversation assignment
    const { data: messagesByLead } = await supabase
      .from("messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })

    const messages = messagesByLead || []

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
          // Table may not exist
        } else {
          // Group media by message_id
          messageMediaMap = (messageMedia || []).reduce((acc: Record<string, any[]>, media: any) => {
            if (!acc[media.message_id]) {
              acc[media.message_id] = []
            }
            acc[media.message_id].push(media)
            return acc
          }, {})
        }
      } catch {
        // Continue without media - don't break the entire API
      }
    }

    // Fetch voicemail recordings for this lead with RLS protection
    const { data: voicemailRecordings } = await supabase
      .from("voicemail_recordings")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })

    // Fetch AI call records for this lead with RLS protection
    const normalizedLeadPhone = normalizePhone(lead.caller_phone)
    let aiCallRecords: any[] | null = null

    try {
      // First try by lead_id
      const { data: aiCallRecordsByLead } = await supabase
        .from("ai_call_records")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })

      if (aiCallRecordsByLead && aiCallRecordsByLead.length > 0) {
        aiCallRecords = aiCallRecordsByLead
      } else {
        // Fallback to business_id lookup + normalized phone comparison
        const { data: aiCallRecordsByBusiness } = await supabase
          .from("ai_call_records")
          .select("*")
          .eq("business_id", lead.business_id)
          .order("created_at", { ascending: false })

        if (aiCallRecordsByBusiness) {
          const matchingRecords = aiCallRecordsByBusiness.filter(record => {
            const normalizedRecordPhone = normalizePhone(record.caller_phone)
            return normalizedRecordPhone === normalizedLeadPhone
          })
          if (matchingRecords.length > 0) {
            aiCallRecords = matchingRecords
          }
        }
      }
    } catch {
      // AI call records table may not exist or query failed; continue without
    }

    // Fetch follow-up jobs for this lead with RLS protection
    const { data: followUpJobs } = await supabase
      .from("follow_up_jobs")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })

    // Fetch payment requests for this lead with RLS protection
    const { data: paymentRequests } = await supabase
      .from("payment_requests")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })

    // Attach media to messages
    const messagesWithMedia = (messages || []).map(message => ({
      ...message,
      media: messageMediaMap[message.id] || []
    }))

    const responseData = {
      ok: true,
      conversationId: conversation?.id ?? null,
      conversation,
      messages: messagesWithMedia,
      lead: {
        ...lead,
        conversation_id: conversation?.id ?? null,
        conversationId: conversation?.id ?? null,
        messages: messagesWithMedia,
        voicemailRecordings: voicemailRecordings || [],
        followUpJobs: followUpJobs || [],
        aiCallRecords: aiCallRecords || [],
        paymentRequests: paymentRequests || []
      }
    }

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Error in lead-details API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
