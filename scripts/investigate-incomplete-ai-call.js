const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function investigateIncompleteAICall() {
  console.log('=== Investigating All AI Call Records ===\n')

  // Find all AI call records
  const { data: aiCallRecords, error } = await supabase
    .from('ai_call_records')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching ai_call_records:', error)
    return
  }

  if (!aiCallRecords || aiCallRecords.length === 0) {
    console.log('No AI call records found')
    return
  }

  console.log(`Found ${aiCallRecords.length} AI call records:\n`)

  for (let i = 0; i < aiCallRecords.length; i++) {
    const aiCallRecord = aiCallRecords[i]
    const callSid = aiCallRecord.call_sid

    console.log(`--- AI Call Record ${i + 1} ---`)
    console.log('CallSid:', callSid)
    console.log('Outcome:', aiCallRecord.outcome)
    console.log('Lead ID:', aiCallRecord.lead_id)
    console.log('Conversation ID:', aiCallRecord.conversation_id)
    console.log('Extracted Info:', JSON.stringify(aiCallRecord.extracted_info, null, 2))
    console.log('Summary:', aiCallRecord.summary || 'N/A')
    console.log('Created At:', aiCallRecord.created_at)
    console.log('Updated At:', aiCallRecord.updated_at)
    console.log()

    // Check for follow-up jobs
    if (aiCallRecord.lead_id) {
      const { data: followUpJobs } = await supabase
        .from('follow_up_jobs')
        .select('*')
        .eq('lead_id', aiCallRecord.lead_id)
        .order('created_at', { ascending: false })

      console.log('  === Follow-up Jobs ===')
      if (followUpJobs && followUpJobs.length > 0) {
        console.log(`  Found ${followUpJobs.length} follow-up jobs:`)
        followUpJobs.forEach((job, j) => {
          console.log(`    ${j + 1}. Job ID: ${job.id}`)
          console.log(`       Status: ${job.status}`)
          console.log(`       Created At: ${job.created_at}`)
          console.log(`       Cancelled Reason: ${job.cancelled_reason || 'N/A'}`)
        })
      } else {
        console.log('  No follow-up jobs found for this lead')
      }
    }

    // Check for messages
    if (aiCallRecord.conversation_id) {
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', aiCallRecord.conversation_id)
        .order('created_at', { ascending: false })

      console.log('  === Messages ===')
      if (messages && messages.length > 0) {
        console.log(`  Found ${messages.length} messages:`)
        messages.forEach((msg, j) => {
          console.log(`    ${j + 1}. Direction: ${msg.direction}`)
          console.log(`       Content: ${msg.content?.substring(0, 100)}...`)
          console.log(`       Created At: ${msg.created_at}`)
        })
      } else {
        console.log('  No messages found for this conversation')
      }
    }

    // Check for call events
    const { data: callEvents } = await supabase
      .from('call_events')
      .select('*')
      .eq('twilio_call_sid', callSid)
      .order('created_at', { ascending: false })

    console.log('  === Call Events ===')
    if (callEvents && callEvents.length > 0) {
      console.log(`  Found ${callEvents.length} call events:`)
      callEvents.forEach((event, j) => {
        console.log(`    ${j + 1}. Call Status: ${event.call_status}`)
        console.log(`       Created At: ${event.created_at}`)
      })
    } else {
      console.log('  No call events found for this CallSid')
    }

    console.log()
  }
}

investigateIncompleteAICall()
