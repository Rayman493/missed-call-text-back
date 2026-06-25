import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function investigateIncompleteAICall() {
  const callSid = 'CA2490d596db125cf0ee3cd65ff9f0a521'
  console.log('=== Investigating AI Call ===')
  console.log('CallSid:', callSid)
  console.log()

  // Find the ai_call_record by CallSid
  const { data: aiCallRecords, error } = await supabase
    .from('ai_call_records')
    .select('*')
    .eq('call_sid', callSid)
    .limit(1)

  if (error) {
    console.error('Error fetching ai_call_records:', error)
    return
  }

  if (!aiCallRecords || aiCallRecords.length === 0) {
    console.log('No AI call record found for CallSid:', callSid)
    return
  }

  const aiCallRecord = aiCallRecords[0]

  console.log('=== AI Call Record ===')
  console.log('CallSid:', callSid)
  console.log('Outcome:', aiCallRecord.outcome)
  console.log('Lead ID:', aiCallRecord.lead_id)
  console.log('Conversation ID:', aiCallRecord.conversation_id)
  console.log('Extracted Info:', JSON.stringify(aiCallRecord.extracted_info, null, 2))
  console.log('Summary:', aiCallRecord.summary || 'N/A')
  console.log('Created At:', aiCallRecord.created_at)
  console.log('Updated At:', aiCallRecord.updated_at)
  console.log()

  // Check for related lead
  if (aiCallRecord.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', aiCallRecord.lead_id)
      .single()

    if (lead) {
      console.log('=== Related Lead ===')
      console.log('Lead ID:', lead.id)
      console.log('Status:', lead.status)
      console.log('Caller Phone:', lead.caller_phone)
      console.log()
    }
  }

  // Check for follow-up jobs
  const { data: followUpJobs } = await supabase
    .from('follow_up_jobs')
    .select('*')
    .eq('lead_id', aiCallRecord.lead_id)
    .order('created_at', { ascending: false })

  console.log('=== Follow-up Jobs ===')
  if (followUpJobs && followUpJobs.length > 0) {
    console.log(`Found ${followUpJobs.length} follow-up jobs:`)
    followUpJobs.forEach((job, i) => {
      console.log(`  ${i + 1}. Job ID: ${job.id}`)
      console.log(`     Status: ${job.status}`)
      console.log(`     Created At: ${job.created_at}`)
      console.log(`     Cancelled Reason: ${job.cancelled_reason || 'N/A'}`)
      console.log()
    })
  } else {
    console.log('No follow-up jobs found for this lead')
    console.log()
  }

  // Check for messages (SMS)
  if (aiCallRecord.conversation_id) {
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', aiCallRecord.conversation_id)
      .order('created_at', { ascending: false })

    console.log('=== Messages in Conversation ===')
    if (messages && messages.length > 0) {
      console.log(`Found ${messages.length} messages:`)
      messages.forEach((msg, i) => {
        console.log(`  ${i + 1}. Message ID: ${msg.id}`)
        console.log(`     Direction: ${msg.direction}`)
        console.log(`     Content: ${msg.content?.substring(0, 100)}...`)
        console.log(`     Created At: ${msg.created_at}`)
        console.log()
      })
    } else {
      console.log('No messages found for this conversation')
      console.log()
    }
  }

  // Check for call events
  const { data: callEvents } = await supabase
    .from('call_events')
    .select('*')
    .eq('twilio_call_sid', callSid)
    .order('created_at', { ascending: false })

  console.log('=== Call Events ===')
  if (callEvents && callEvents.length > 0) {
    console.log(`Found ${callEvents.length} call events:`)
    callEvents.forEach((event, i) => {
      console.log(`  ${i + 1}. Event ID: ${event.id}`)
      console.log(`     Call Status: ${event.call_status}`)
      console.log(`     Created At: ${event.created_at}`)
      console.log()
    })
  } else {
    console.log('No call events found for this CallSid')
    console.log()
  }

  // Check for conversation activity
  if (aiCallRecord.conversation_id) {
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', aiCallRecord.conversation_id)
      .single()

    if (conversation) {
      console.log('=== Conversation ===')
      console.log('Conversation ID:', conversation.id)
      console.log('Last Activity At:', conversation.last_activity_at)
      console.log()
    }
  }
}

investigateIncompleteAICall()
