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
      .eq("business_id", lead.business_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    console.log("[lead-details API] Conversation found:", conversation?.id || 'none')

    // Fetch messages by lead_id to ensure all messages for the lead are visible
    // regardless of conversation assignment
    const { data: messagesByLead, error: messagesByLeadError } = await supabase
      .from("messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true })

    let messages: any[] = []
    if (!messagesByLeadError && messagesByLead && messagesByLead.length > 0) {
      messages = messagesByLead
    }

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
          console.log("[MMS DEBUG] Media URLs:", messageMedia?.map(m => m.media_url))
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
    const normalizedLeadPhone = normalizePhone(lead.caller_phone)
    console.log("[AI DETAILS FETCH]", {
      leadId: lead.id,
      businessId: lead.business_id,
      callerPhone: lead.caller_phone,
      normalizedCallerPhone: normalizedLeadPhone
    })

    console.log("[AI LINK START]", {
      leadId: lead.id,
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

    console.log("[AI DETAILS BY LEAD]", {
      count: aiCallRecordsByLead?.length || 0,
      error: aiCallErrorByLead?.message || 'none'
    })

    if (!aiCallErrorByLead && aiCallRecordsByLead && aiCallRecordsByLead.length > 0) {
      console.log("[AI LINK LEAD FOUND]", {
        leadId: leadId,
        recordCount: aiCallRecordsByLead.length
      })
      aiCallRecords = aiCallRecordsByLead
    } else {
      // Fallback to business_id lookup + normalized phone comparison
      console.log("[AI DETAILS FALLBACK START]")
      const { data: aiCallRecordsByBusiness, error: aiCallErrorByBusiness } = await supabase
        .from("ai_call_records")
        .select("*")
        .eq("business_id", lead.business_id)
        .order("created_at", { ascending: false })

      console.log("[AI DETAILS BY BUSINESS]", {
        count: aiCallRecordsByBusiness?.length || 0,
        error: aiCallErrorByBusiness?.message || 'none'
      })

      if (!aiCallErrorByBusiness && aiCallRecordsByBusiness) {
        // Filter by normalized phone comparison
        const matchingRecords = aiCallRecordsByBusiness.filter(record => {
          const normalizedRecordPhone = normalizePhone(record.caller_phone)
          const matches = normalizedRecordPhone === normalizedLeadPhone
          console.log("[AI DETAILS PHONE COMPARISON]", {
            recordPhone: record.caller_phone,
            normalizedRecordPhone,
            leadPhone: lead.caller_phone,
            normalizedLeadPhone,
            matches
          })
          return matches
        })

        console.log("[AI DETAILS BY PHONE]", {
          totalBusinessRecords: aiCallRecordsByBusiness.length,
          matchingRecords: matchingRecords.length
        })

        if (matchingRecords.length > 0) {
          console.log("[AI LINK CONVERSATION FOUND]", {
            recordCount: matchingRecords.length
          })
          aiCallRecords = matchingRecords
          aiCallError = null
        } else {
          console.log("[AI LINK NO MATCHING RECORDS]")
          aiCallError = { message: 'No matching records found by normalized phone' }
        }
      } else {
        console.log("[AI LINK BUSINESS LOOKUP ERROR]", {
          error: aiCallErrorByBusiness?.message
        })
        aiCallError = aiCallErrorByBusiness
      }
    }

    if (aiCallRecords && aiCallRecords.length > 0) {
      console.log("[AI CALL RECORD LINKED]", {
        recordId: aiCallRecords[0].id,
        leadId: aiCallRecords[0].lead_id,
        conversationId: aiCallRecords[0].conversation_id,
        summaryExists: !!aiCallRecords[0].summary,
        extractedInfoExists: !!aiCallRecords[0].extracted_info,
        outcome: aiCallRecords[0].outcome,
        createdAt: aiCallRecords[0].created_at
      })
    } else {
      console.log("[AI CALL RECORD NOT LINKED]", {
        recordId: null,
        error: aiCallError?.message || 'No records found'
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
        aiCallRecords: aiCallRecords || []
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
