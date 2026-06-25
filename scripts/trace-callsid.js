const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const targetCallSid = 'CA4b4aeb35b264448c6d4ff54d14178902'

async function traceCallSid() {
  console.log('=== Tracing CallSid:', targetCallSid, '===\n')

  // 1. Check AI call record
  console.log('1. AI Call Record')
  const { data: aiCallRecords, error: aiError } = await supabase
    .from('ai_call_records')
    .select('*')
    .eq('call_sid', targetCallSid)

  if (aiError) {
    console.log('   ERROR:', aiError.message)
    console.log('   No AI call record found for this CallSid\n')
  } else if (!aiCallRecords || aiCallRecords.length === 0) {
    console.log('   No AI call record found for this CallSid')
    console.log('   This is the first failure point - incomplete finalization did not create an AI call record\n')
  } else {
    console.log(`   Found ${aiCallRecords.length} AI call record(s):`)
    aiCallRecords.forEach((record, i) => {
      console.log(`   ${i + 1}. ID: ${record.id}`)
      console.log(`      Outcome: ${record.outcome}`)
      console.log(`      Lead ID: ${record.lead_id}`)
      console.log(`      Conversation ID: ${record.conversation_id}`)
      console.log(`      Extracted Info:`, JSON.stringify(record.extracted_info, null, 2))
      console.log(`      Summary: ${record.summary || 'N/A'}`)
      console.log(`      Created At: ${record.created_at}`)
    })
    console.log()
  }

  // 2. Check lead
  console.log('2. Lead')
  const aiCallRecord = aiCallRecords?.[0]
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', aiCallRecord?.lead_id)
    .single()

  if (leadError || !lead) {
    console.log('   ERROR:', leadError?.message || 'Lead not found')
    console.log('   No lead found\n')
  } else {
    console.log('   Found lead:')
    console.log('   - ID:', lead.id)
    console.log('   - Phone:', lead.caller_phone)
    console.log('   - Name:', lead.name || 'N/A')
    console.log('   - Status:', lead.status)
    console.log('   - Created At:', lead.created_at)
    console.log()
  }

  // 3. Check conversation
  console.log('3. Conversation')
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', aiCallRecord?.conversation_id)
    .single()

  if (convError || !conversation) {
    console.log('   ERROR:', convError?.message || 'Conversation not found')
    console.log('   No conversation found\n')
  } else {
    console.log('   Found conversation:')
    console.log('   - ID:', conversation.id)
    console.log('   - Lead ID:', conversation.lead_id)
    console.log('   - Business ID:', conversation.business_id)
    console.log('   - Status:', conversation.status)
    console.log('   - Created At:', conversation.created_at)
    console.log()
  }

  // 4. Check messages (summary SMS)
  console.log('4. Messages (Summary SMS)')
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', aiCallRecord?.conversation_id)
    .order('created_at', { ascending: false })

  if (msgError) {
    console.log('   ERROR:', msgError.message)
    console.log()
  } else if (!messages || messages.length === 0) {
    console.log('   No messages found for this conversation\n')
  } else {
    console.log(`   Found ${messages.length} messages:`)
    messages.forEach((msg, i) => {
      console.log(`   ${i + 1}. ID: ${msg.id}`)
      console.log(`      Direction: ${msg.direction}`)
      console.log(`      Message Type: ${msg.message_type || 'N/A'}`)
      console.log(`      Content: ${msg.content?.substring(0, 200)}...`)
      console.log(`      Twilio Message SID: ${msg.twilio_message_sid || 'N/A'}`)
      console.log(`      Status: ${msg.status || 'N/A'}`)
      console.log(`      Created At: ${msg.created_at}`)
    })
    console.log()
  }

  // 5. Check follow-up jobs
  console.log('5. Follow-up Jobs')
  const { data: followUps, error: followUpError } = await supabase
    .from('follow_up_jobs')
    .select('*')
    .eq('lead_id', aiCallRecord?.lead_id)
    .order('created_at', { ascending: false })

  if (followUpError) {
    console.log('   ERROR:', followUpError.message)
    console.log()
  } else if (!followUps || followUps.length === 0) {
    console.log('   No follow-up jobs found for this lead\n')
  } else {
    console.log(`   Found ${followUps.length} follow-up jobs:`)
    followUps.forEach((job, i) => {
      console.log(`   ${i + 1}. ID: ${job.id}`)
      console.log(`      Status: ${job.status}`)
      console.log(`      Cancelled Reason: ${job.cancelled_reason || 'N/A'}`)
      console.log(`      Created At: ${job.created_at}`)
    })
    console.log()
  }

  // 6. Check call events
  console.log('6. Call Events')
  const { data: callEvents, error: eventsError } = await supabase
    .from('call_events')
    .select('*')
    .eq('twilio_call_sid', targetCallSid)
    .order('created_at', { ascending: false })

  if (eventsError) {
    console.log('   ERROR:', eventsError.message)
    console.log()
  } else if (!callEvents || callEvents.length === 0) {
    console.log('   No call events found for this CallSid\n')
  } else {
    console.log(`   Found ${callEvents.length} call events:`)
    callEvents.forEach((event, i) => {
      console.log(`   ${i + 1}. Call Status: ${event.call_status}`)
      console.log(`      Created At: ${event.created_at}`)
    })
    console.log()
  }

  console.log('=== Trace Complete ===')
}

traceCallSid()
