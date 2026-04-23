import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { sendSms } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  try {
    console.log('[send-followups] Starting follow-up processing')
    
    // Fetch all due follow-ups: status = 'pending', scheduled_for <= now()
    const dueFollowUps = await db.getDueFollowUps()
    
    if (dueFollowUps.length === 0) {
      console.log('[send-followups] No due follow-ups found')
      return NextResponse.json({ 
        processed: 0,
        sent: 0,
        cancelled: 0,
        errors: 0
      })
    }
    
    console.log(`[send-followups] Found ${dueFollowUps.length} due follow-ups`)
    
    let processed = 0
    let sent = 0
    let cancelled = 0
    let errors = 0
    
    // Loop through each due follow-up and process it
    for (const followUp of dueFollowUps) {
      processed++
      console.log(`[send-followups] Processing follow_up id: ${followUp.id}`)
      
      try {
        // Fetch conversation
        const conversation = await db.getConversationById(followUp.conversation_id)
        
        // Skip if conversation does not exist or status != 'open'
        if (!conversation || conversation.status !== 'open') {
          console.log(`[send-followups] Skipped because conversation closed: ${followUp.id}`)
          
          // Update follow_up.status = 'cancelled'
          await db.cancelFollowUp(followUp.id)
          cancelled++
          continue
        }
        
        // Check whether there is any inbound customer message in that conversation after follow_up.created_at
        const latestInboundMessage = await db.getLatestInboundMessageForConversation(
          followUp.conversation_id, 
          followUp.created_at
        )
        
        // If customer already replied
        if (latestInboundMessage) {
          console.log(`[send-followups] Cancelled because customer replied: ${followUp.id}`)
          
          // Update follow_up.status = 'cancelled'
          await db.cancelFollowUp(followUp.id)
          cancelled++
          continue
        }
        
        // Valid to send - fetch lead and business
        const lead = await db.getLeadById(conversation.lead_id)
        const business = await db.getBusinessById(followUp.business_id)
        
        if (!lead || !business) {
          console.log(`[send-followups] Error - missing lead or business: ${followUp.id}`)
          errors++
          continue
        }
        
        // Call existing sendSms helper
        const messageSid = await sendSms(lead.caller_phone, followUp.message_body)
        
        if (!messageSid) {
          console.log(`[send-followups] Twilio error - failed to send SMS: ${followUp.id}`)
          errors++
          continue
        }
        
        console.log(`[send-followups] Sent successfully: ${followUp.id}, SID: ${messageSid}`)
        
        // Insert outbound row into public.messages
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
          console.log(`[send-followups] Warning - failed to save message: ${followUp.id}`)
        }
        
        // Update follow_up: status = 'sent', sent_at = now()
        await db.markFollowUpSent(followUp.id)
        sent++
        
        // Update conversation activity
        await db.updateConversation(conversation.id, {
          last_activity_at: new Date().toISOString(),
        })
        
      } catch (error) {
        console.log(`[send-followups] DB or Twilio error processing ${followUp.id}:`, error)
        errors++
      }
    }
    
    console.log(`[send-followups] Complete - Processed: ${processed}, Sent: ${sent}, Cancelled: ${cancelled}, Errors: ${errors}`)
    
    // Return JSON summary only
    return NextResponse.json({
      processed,
      sent,
      cancelled,
      errors
    })
    
  } catch (error) {
    console.error('[send-followups] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Also support GET for testing (but POST does the actual processing)
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
        lead_id: fu.lead_id,
        business_id: fu.business_id,
        kind: fu.kind,
        scheduled_for: fu.scheduled_for,
        status: fu.status,
        created_at: fu.created_at
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
