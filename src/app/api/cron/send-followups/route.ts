import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { sendSms } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  try {
    console.log('[send-followups] Starting follow-up processing')
    
    // Query due follow_ups where: status = 'pending', scheduled_for <= now()
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
    
    // Loop through each due follow_up
    for (const followUp of dueFollowUps) {
      processed++
      console.log(`[send-followups] Processing follow_up: ${followUp.id}`)
      
      try {
        // Fetch conversation
        const conversation = await db.getConversationById(followUp.conversation_id)
        
        // If conversation missing or conversation.status != 'open'
        if (!conversation || conversation.status !== 'open') {
          console.log(`[send-followups] Cancelling - conversation not open: ${followUp.id}`)
          
          // Mark follow_up as `cancelled`
          await db.cancelFollowUp(followUp.id)
          cancelled++
          continue
        }
        
        // Check whether the customer already replied
        // Query public.messages for any message in the same conversation where:
        // direction = 'inbound' and created_at > follow_up.created_at
        const latestInboundMessage = await db.getLatestInboundMessageForConversation(
          followUp.conversation_id, 
          followUp.created_at
        )
        
        // If found
        if (latestInboundMessage) {
          console.log(`[send-followups] Cancelling - customer already replied: ${followUp.id}`)
          
          // Mark follow_up as `cancelled`
          await db.cancelFollowUp(followUp.id)
          cancelled++
          continue
        }
        
        // If still valid - fetch lead and business
        const lead = await db.getLeadById(conversation.lead_id)
        const business = await db.getBusinessById(followUp.business_id)
        
        if (!lead || !business) {
          console.log(`[send-followups] Error - missing lead or business: ${followUp.id}`)
          errors++
          continue
        }
        
        // Send SMS using the existing sendSms helper
        const messageSid = await sendSms(business, lead.caller_phone, followUp.message_body)
        
        if (!messageSid) {
          console.log(`[send-followups] Error - SMS failed to send: ${followUp.id}`)
          errors++
          continue
        }
        
        console.log(`[send-followups] SMS sent successfully: ${followUp.id}, SID: ${messageSid}`)
        
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
          console.log(`[send-followups] Warning - failed to save outbound message: ${followUp.id}`)
        }
        
        // After successful send - update follow_up
        await db.markFollowUpSent(followUp.id)
        sent++
        
        // Update conversation activity
        await db.updateConversation(conversation.id, {
          last_activity_at: new Date().toISOString(),
        })
        
      } catch (error) {
        console.log(`[send-followups] Error processing follow-up ${followUp.id}:`, error)
        errors++
      }
    }
    
    console.log(`[send-followups] Complete - Processed: ${processed}, Sent: ${sent}, Cancelled: ${cancelled}, Errors: ${errors}`)
    
    // Return ONLY this JSON summary
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

// Also support GET for testing (but it should also process, not just list)
export async function GET() {
  try {
    console.log('[send-followups] GET request - processing follow-ups')
    
    // For GET, also process follow-ups (same logic as POST)
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
    
    // Loop through each due follow_up
    for (const followUp of dueFollowUps) {
      processed++
      console.log(`[send-followups] Processing follow_up: ${followUp.id}`)
      
      try {
        // Fetch conversation
        const conversation = await db.getConversationById(followUp.conversation_id)
        
        // If conversation missing or conversation.status != 'open'
        if (!conversation || conversation.status !== 'open') {
          console.log(`[send-followups] Cancelling - conversation not open: ${followUp.id}`)
          
          // Mark follow_up as `cancelled`
          await db.cancelFollowUp(followUp.id)
          cancelled++
          continue
        }
        
        // Check whether the customer already replied
        const latestInboundMessage = await db.getLatestInboundMessageForConversation(
          followUp.conversation_id, 
          followUp.created_at
        )
        
        // If found
        if (latestInboundMessage) {
          console.log(`[send-followups] Cancelling - customer already replied: ${followUp.id}`)
          
          // Mark follow_up as `cancelled`
          await db.cancelFollowUp(followUp.id)
          cancelled++
          continue
        }
        
        // If still valid - fetch lead and business
        const lead = await db.getLeadById(conversation.lead_id)
        const business = await db.getBusinessById(followUp.business_id)
        
        if (!lead || !business) {
          console.log(`[send-followups] Error - missing lead or business: ${followUp.id}`)
          errors++
          continue
        }
        
        // Send SMS using the existing sendSms helper
        const messageSid = await sendSms(business, lead.caller_phone, followUp.message_body)
        
        if (!messageSid) {
          console.log(`[send-followups] Error - SMS failed to send: ${followUp.id}`)
          errors++
          continue
        }
        
        console.log(`[send-followups] SMS sent successfully: ${followUp.id}, SID: ${messageSid}`)
        
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
          console.log(`[send-followups] Warning - failed to save outbound message: ${followUp.id}`)
        }
        
        // After successful send - update follow_up
        await db.markFollowUpSent(followUp.id)
        sent++
        
        // Update conversation activity
        await db.updateConversation(conversation.id, {
          last_activity_at: new Date().toISOString(),
        })
        
      } catch (error) {
        console.log(`[send-followups] Error processing follow-up ${followUp.id}:`, error)
        errors++
      }
    }

    console.log(`[send-followups] Complete - Processed: ${processed}, Sent: ${sent}, Cancelled: ${cancelled}, Errors: ${errors}`)

    // Return ONLY this JSON summary
    return NextResponse.json({
      processed,
      sent,
      cancelled,
      errors
    })

  } catch (error) {
    console.error('[send-followups] GET error:', error)

    return NextResponse.json(
      { 
        error: 'Internal server error',
        errorDetails: [error.message]
      },
      { status: 500 }
    )
  }
}
