import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { sendSms } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  try {
    console.log('[send-followups] Starting follow-up processing')
    
    // Get all due follow-ups
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
    
    // Loop through all due follow-ups
    for (const followUp of dueFollowUps) {
      processed++
      console.log(`[send-followups] Processing follow_up: ${followUp.id}`)
      
      try {
        // Fetch conversation
        const conversation = await db.getConversationById(followUp.conversation_id)
        
        if (!conversation) {
          console.log(`[send-followups] Skipped (conversation not found): ${followUp.id}`)
          errors++
          continue
        }
        
        // Skip if conversation.status !== 'open'
        if (conversation.status !== 'open') {
          console.log(`[send-followups] Skipped (conversation closed): ${followUp.id}`)
          
          // Mark as cancelled
          await db.cancelFollowUp(followUp.id)
          cancelled++
          continue
        }
        
        // Check for inbound messages AFTER follow_up.created_at
        const latestInboundMessage = await db.getLatestInboundMessageForConversation(
          followUp.conversation_id, 
          followUp.created_at
        )
        
        if (latestInboundMessage) {
          console.log(`[send-followups] Cancelled (user replied): ${followUp.id}`)
          
          // Mark follow_up as 'cancelled'
          await db.cancelFollowUp(followUp.id)
          cancelled++
          continue
        }
        
        // Valid to send - fetch business and lead
        const business = await db.getBusinessById(followUp.business_id)
        const lead = await db.getLeadById(conversation.lead_id)
        
        if (!business || !lead) {
          console.log(`[send-followups] Error (missing business/lead): ${followUp.id}`)
          errors++
          continue
        }
        
        // Call sendSms
        const messageSid = await sendSms(lead.caller_phone, followUp.message_body)
        
        if (!messageSid) {
          console.log(`[send-followups] Error (SMS failed): ${followUp.id}`)
          errors++
          continue
        }
        
        console.log(`[send-followups] Sent successfully: ${followUp.id}, SID: ${messageSid}`)
        
        // Insert new row into public.messages
        const outboundMessage = await db.createMessageWithConversation({
          direction: 'outbound',
          body: followUp.message_body,
          lead_id: lead.id,
          conversation_id: conversation.id,
          from_phone: business.twilio_phone_number,
          to_phone: lead.caller_phone,
          created_at: new Date().toISOString(),
        })
        
        if (!outboundMessage) {
          console.log(`[send-followups] Warning (message save failed): ${followUp.id}`)
        }
        
        // Update follow_up: status = 'sent', sent_at = now()
        await db.markFollowUpSent(followUp.id)
        sent++
        
        // Update conversation activity
        await db.updateConversation(conversation.id, {
          last_activity_at: new Date().toISOString(),
        })
        
      } catch (error) {
        console.log(`[send-followups] Error processing ${followUp.id}:`, error)
        errors++
      }
    }
    
    console.log(`[send-followups] Complete - Processed: ${processed}, Sent: ${sent}, Cancelled: ${cancelled}, Errors: ${errors}`)
    
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
