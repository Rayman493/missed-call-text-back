import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { sendSms } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  try {
    console.log('[send-followups] Starting follow-up sending process')
    
    // Get all due follow-ups
    const dueFollowUps = await db.getDueFollowUps()
    
    if (dueFollowUps.length === 0) {
      console.log('[send-followups] No due follow-ups found')
      return NextResponse.json({ message: 'No due follow-ups found' })
    }
    
    console.log(`[send-followups] Found ${dueFollowUps.length} due follow-ups`)
    
    const results = []
    
    for (const followUp of dueFollowUps) {
      try {
        console.log(`[send-followups] Processing follow-up: ${followUp.id}`)
        
        // Verify conversation is still open
        const conversation = await db.getConversationById(followUp.conversation_id)
        
        if (!conversation) {
          console.error(`[send-followups] Conversation not found: ${followUp.conversation_id}`)
          continue
        }
        
        if (conversation.status !== 'open') {
          console.log(`[send-followups] Conversation ${conversation.id} is not open (status: ${conversation.status}), skipping`)
          continue
        }
        
        // Verify there is NO inbound customer message in that conversation after the follow_up was created
        const latestInboundMessage = await db.getLatestInboundMessageForConversation(
          followUp.conversation_id, 
          followUp.created_at
        )
        
        if (latestInboundMessage) {
          console.log(`[send-followups] Found inbound message after follow-up creation, skipping: ${latestInboundMessage.id}`)
          continue
        }
        
        // Get lead information to send SMS
        const lead = await db.getLeadByPhone(conversation.business_id, conversation.lead_id)
        
        if (!lead) {
          console.error(`[send-followups] Lead not found for conversation: ${conversation.id}`)
          continue
        }
        
        // Send the SMS
        const messageSid = await sendSms(lead.caller_phone, followUp.message_body)
        
        if (!messageSid) {
          console.error(`[send-followups] Failed to send SMS for follow-up: ${followUp.id}`)
          continue
        }
        
        console.log(`[send-followups] Sent SMS for follow-up: ${followUp.id}, SID: ${messageSid}`)
        
        // Insert outbound message into public.messages
        const business = await db.getBusinessByPhone(process.env.TWILIO_PHONE_NUMBER!)
        
        if (!business) {
          console.error('[send-followups] Business not found for Twilio phone number')
          continue
        }
        
        const outboundMessage = await db.createMessageWithConversation({
          lead_id: lead.id,
          conversation_id: conversation.id,
          direction: 'outbound',
          body: followUp.message_body,
          from_phone: business.twilio_phone_number,
          to_phone: lead.caller_phone,
          created_at: new Date().toISOString(),
        })
        
        if (!outboundMessage) {
          console.error(`[send-followups] Failed to save outbound message for follow-up: ${followUp.id}`)
        } else {
          console.log(`[send-followups] Saved outbound message: ${outboundMessage.id}`)
        }
        
        // Update follow-up status to sent
        const updatedFollowUp = await db.markFollowUpSent(followUp.id)
        
        if (!updatedFollowUp) {
          console.error(`[send-followups] Failed to mark follow-up as sent: ${followUp.id}`)
        } else {
          console.log(`[send-follow-ups] Marked follow-up as sent: ${updatedFollowUp.id}`)
        }
        
        // Update conversation activity
        await db.updateConversation(conversation.id, {
          last_activity_at: new Date().toISOString(),
        })
        
        results.push({
          followUpId: followUp.id,
          status: 'sent',
          messageSid,
          outboundMessageId: outboundMessage?.id
        })
        
      } catch (error) {
        console.error(`[send-followups] Error processing follow-up ${followUp.id}:`, error)
        results.push({
          followUpId: followUp.id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    console.log(`[send-followups] Processed ${dueFollowUps.length} follow-ups, sent: ${results.filter(r => r.status === 'sent').length}`)
    
    return NextResponse.json({
      message: 'Follow-up sending process completed',
      processed: dueFollowUps.length,
      results
    })
    
  } catch (error) {
    console.error('[send-followups] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Also support GET for testing
export async function GET() {
  try {
    console.log('[send-followups] GET request - checking due follow-ups')
    
    const dueFollowUps = await db.getDueFollowUps()
    
    return NextResponse.json({
      message: 'Due follow-ups check',
      count: dueFollowUps.length,
      followUps: dueFollowUps.map(fu => ({
        id: fu.id,
        conversation_id: fu.conversation_id,
        kind: fu.kind,
        scheduled_for: fu.scheduled_for,
        status: fu.status
      }))
    })
    
  } catch (error) {
    console.error('[send-followups] GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
