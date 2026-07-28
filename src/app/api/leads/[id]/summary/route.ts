import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const MODEL = process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[AI Summary] ========== REQUEST START ==========')
    console.log('[AI Summary] Request received')
    
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('[AI Summary] OpenAI API key missing')
      return NextResponse.json({ error: 'openai_api_key_missing' }, { status: 500 })
    }
    console.log('[AI Summary] OpenAI API key available')

    const { id } = await params
    const leadId = id
    console.log('[AI Summary] Requested lead UUID:', leadId)
    console.log('[AI Summary] UUID format check:', leadId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? 'Valid UUID' : 'Invalid UUID')
    
    const supabase = await createServerSupabaseClient()
    console.log('[AI Summary] Supabase client created')

    // Check authentication
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      console.error('[AI Summary] Authentication failed:', userError)
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    console.log('[AI Summary] Authenticated user ID:', user.id)

    // Get user's business ID
    console.log('[AI Summary] Looking up business for user:', user.id)
    const { data: businessData, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    console.log('[AI Summary] Business lookup result:', { businessData, businessError })
    if (businessError || !businessData) {
      console.error('[AI Summary] Business not found - CONDITION: businessError || !businessData')
      console.error('[AI Summary] businessError:', businessError)
      console.error('[AI Summary] businessData:', businessData)
      return NextResponse.json({ error: 'business_not_found' }, { status: 403 })
    }
    console.log('[AI Summary] Authenticated business ID:', businessData.id)

    // Fetch lead data with all related information
    console.log('[AI Summary] Executing lead query')
    console.log('[AI Summary] Query conditions: id =', leadId, ', business_id =', businessData.id)
    console.log('[AI Summary] Table: leads')
    
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(`
        *,
        messages (
          id,
          body,
          direction,
          status,
          created_at
        ),
        conversations!conversation_id (
          id,
          status,
          source,
          started_at,
          last_activity_at
        ),
        voicemail_recordings (
          id,
          recording_url,
          recording_duration,
          recording_status,
          created_at
        ),
        ai_call_records (
          id,
          extracted_info,
          caller_phone,
          business_id,
          lead_id,
          created_at,
          outcome
        ),
        jobs!jobs_lead_id_fkey (
          id,
          title,
          status,
          scheduled_date,
          scheduled_time,
          service_address,
          notes,
          created_at
        ),
        payment_requests:payment_requests!payment_requests_lead_id_fkey (
          id,
          amount_cents,
          status,
          requested_at,
          paid_at
        )
      `)
      .eq('id', leadId)
      .eq('business_id', businessData.id)
      .single()

    console.log('[AI Summary] Lead query completed')
    console.log('[AI Summary] leadError:', leadError)
    console.log('[AI Summary] lead data:', lead ? 'ROW RETURNED' : 'NO ROW RETURNED')

    if (leadError) {
      console.error('[AI Summary] ========== DATABASE ERROR ==========')
      console.error('[AI Summary] leadError:', leadError)
      console.error('[AI Summary] leadError code:', leadError?.code)
      console.error('[AI Summary] leadError message:', leadError?.message)
      console.error('[AI Summary] leadError details:', leadError?.details)
      console.error('[AI Summary] Query details: leadId =', leadId, ', businessId =', businessData.id)
      console.error('[AI Summary] Returning 500 lead_query_failed')
      return NextResponse.json({ error: 'lead_query_failed' }, { status: 500 })
    }

    if (!lead) {
      console.error('[AI Summary] ========== LEAD NOT FOUND ==========')
      console.error('[AI Summary] lead:', lead)
      console.error('[AI Summary] Query details: leadId =', leadId, ', businessId =', businessData.id)
      console.error('[AI Summary] Returning 404 lead_not_found')
      return NextResponse.json({ error: 'lead_not_found' }, { status: 404 })
    }

    console.log('[AI Summary] Lead data fetched successfully')
    console.log('[AI Summary] lead.id:', lead.id)
    console.log('[AI Summary] lead.business_id:', lead.business_id)
    console.log('[AI Summary] lead.caller_phone:', lead.caller_phone)
    console.log('[AI Summary] Comparison: authenticated business_id =', businessData.id, ', lead.business_id =', lead.business_id)
    console.log('[AI Summary] Business ID match:', lead.business_id === businessData.id ? 'MATCH' : 'NO MATCH')

    // Build context for AI summary
    const context: any = {
      customer: {
        name: (lead.name && lead.name !== 'Not collected') ? lead.name : (lead.caller_phone || 'Unknown'),
        phone: lead.caller_phone || '',
        status: lead.status,
        created_at: lead.created_at,
        first_contact_at: lead.first_contact_at,
        last_message_at: lead.last_message_at
      },
      aiIntake: null,
      messages: [],
      jobs: [],
      payments: [],
      voicemails: []
    }

    // Extract AI intake information
    if (lead.ai_call_records && lead.ai_call_records.length > 0) {
      const latestAI = lead.ai_call_records[0]
      if (latestAI.extracted_info) {
        context.aiIntake = {
          serviceRequested: latestAI.extracted_info.service_requested,
          desiredCompletion: latestAI.extracted_info.desired_completion,
          serviceAddress: latestAI.extracted_info.service_address,
          additionalDetails: latestAI.extracted_info.additional_details,
          customerName: latestAI.extracted_info.customer_name,
          customerPhone: latestAI.extracted_info.customer_phone,
          outcome: latestAI.outcome
        }
      }
    }

    // Summarize messages
    if (lead.messages && lead.messages.length > 0) {
      const messageCount = lead.messages.length
      const inboundCount = lead.messages.filter((m: any) => m.direction === 'inbound').length
      const outboundCount = lead.messages.filter((m: any) => m.direction === 'outbound').length
      const latestMessage = lead.messages[0]
      
      context.messages = {
        total: messageCount,
        inbound: inboundCount,
        outbound: outboundCount,
        latest: {
          direction: latestMessage.direction,
          status: latestMessage.status,
          created_at: latestMessage.created_at
        }
      }
    }

    // Summarize jobs
    if (lead.jobs && lead.jobs.length > 0) {
      context.jobs = lead.jobs.map((job: any) => ({
        title: job.title,
        status: job.status,
        scheduled_date: job.scheduled_date,
        scheduled_time: job.scheduled_time,
        service_address: job.service_address,
        notes: job.notes
      }))
    }

    // Summarize payments
    if (lead.payment_requests && lead.payment_requests.length > 0) {
      context.payments = lead.payment_requests.map((payment: any) => ({
        amount_cents: payment.amount_cents,
        status: payment.status,
        requested_at: payment.requested_at,
        paid_at: payment.paid_at
      }))
    }

    // Summarize voicemails
    if (lead.voicemail_recordings && lead.voicemail_recordings.length > 0) {
      context.voicemails = {
        count: lead.voicemail_recordings.length,
        latest: lead.voicemail_recordings[0].created_at
      }
    }

    // Add internal notes if available
    if (lead.notes) {
      context.notes = lead.notes
    }

    console.log('[AI Summary] Context assembled')
    console.log('[AI Summary] Context keys:', Object.keys(context))

    // Build prompt for OpenAI
    const systemPrompt = `You are a helpful assistant that summarizes customer information for small service businesses.
- Produce ONE concise paragraph (120-200 words) summarizing the customer.
- Use ONLY facts from the provided customer data.
- Highlight important customer history.
- Mention outstanding work if applicable.
- Mention completed work if applicable.
- Mention payment status if applicable.
- Mention upcoming appointments if applicable.
- Keep the tone professional and business-focused.
- NEVER fabricate information.
- NEVER guess or speculate.
- If information is unavailable, simply exclude it.
- Do not invent preferences or details not in the data.`

    const userPrompt = `Customer Data:\n${JSON.stringify(context, null, 2)}\n\nGenerate a concise business summary of this customer.`

    console.log('[AI Summary] OpenAI API request started')
    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 300
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('[AI Summary] OpenAI API error:', errorData)
      return NextResponse.json({ error: 'openai_api_failed' }, { status: 500 })
    }

    const data = await response.json()
    const summary = data?.choices?.[0]?.message?.content || ''

    if (!summary) {
      console.error('[AI Summary] No summary generated from OpenAI response')
      return NextResponse.json({ error: 'no_summary_generated' }, { status: 500 })
    }

    console.log('[AI Summary] Summary generated successfully, status: 200')
    return NextResponse.json({ summary })
  } catch (error) {
    console.error('[AI Summary] Error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
