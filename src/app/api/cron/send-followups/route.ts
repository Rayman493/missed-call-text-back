import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/twilio'

// Helper function to validate environment variables
function getRequiredEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Initialize Supabase client with service role key (server-side only)
const supabase = createClient(
  getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY')
)

export async function POST(req: NextRequest) {
  try {
    // Verify CRON_SECRET for cron job protection
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get('secret')
    const authHeader = req.headers.get('authorization')
    const cronHeader = req.headers.get('x-vercel-cron')

    const expectedSecret = process.env.CRON_SECRET
    if (!expectedSecret) {
      console.error('[Security] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const isAuthorized =
      cronHeader === '1' ||
      secret === expectedSecret ||
      authHeader === `Bearer ${expectedSecret}`

    if (!isAuthorized) {
      console.error('[Security] Unauthorized request to /api/cron/send-followups')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Cron] Authorized cron request to /api/cron/send-followups');
    console.log('[cron] Manual trigger authorized:', secret === expectedSecret);
    console.log('[send-followups] Starting follow-up processing')
    
    // Query due follow_up_jobs where: status = 'pending', scheduled_for <= now()
    const now = new Date().toISOString()
    const { data: dueFollowUps, error: followUpsError } = await supabase
      .from('follow_up_jobs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
    
    if (followUpsError) {
      console.error('[send-followups] Error fetching due follow-ups:', followUpsError)
      throw followUpsError
    }
    
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
        console.log(`[followups] Processing due follow-up: ${followUp.id}`)
        console.log(`[followups] Follow-up details:`, {
          follow_up_id: followUp.id,
          lead_id: followUp.lead_id,
          business_id: followUp.business_id,
          conversation_id: followUp.conversation_id,
          scheduled_for: followUp.scheduled_for
        })
        
        // Get open conversation for this lead
        const { data: conversation, error: conversationError } = await supabase
          .from('conversations')
          .select('*')
          .eq('lead_id', followUp.lead_id)
          .eq('status', 'open')
          .single()
        
        if (conversationError || !conversation) {
          console.warn(`[followups] No open conversation found for lead: ${followUp.lead_id}, cancelling follow-up: ${followUp.id}`)
          
          // Mark follow-up as cancelled
          const { error: cancelError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'cancelled',
              cancelled_reason: 'no_conversation',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[followups] Error cancelling follow-up:', cancelError)
          }
          cancelled++
          continue
        }
        
        console.log(`[followups] Found conversation: ${conversation.id} for lead: ${followUp.lead_id}`)
        
        // Check whether the customer already replied after follow-up was created
        const { data: latestInboundMessage, error: messageError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .eq('direction', 'inbound')
          .gt('created_at', followUp.created_at)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        if (messageError && messageError.code !== 'PGRST116') { // PGRST116 is "not found" error
          console.error('[followups] Error checking for replies:', messageError)
        }
        
        // If customer replied, cancel follow-up
        if (latestInboundMessage) {
          console.log(`[followups] Customer replied, cancelling follow-up: ${followUp.id}`)
          
          const { error: cancelError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'cancelled',
              cancelled_reason: 'customer_replied',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[followups] Error cancelling follow-up:', cancelError)
          }
          cancelled++
          continue
        }
        
        // If still valid - fetch lead and business
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('*')
          .eq('id', conversation.lead_id)
          .single()
        
        if (leadError) {
          console.error('[send-followups] Error fetching lead:', leadError)
          throw leadError
        }
        
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', followUp.business_id)
          .single()
        
        if (businessError) {
          console.error('[send-followups] Error fetching business:', businessError)
          throw businessError
        }
        
        if (!lead || !business) {
          console.log(`[send-followups] Error - missing lead or business: ${followUp.id}`)
          errors++
          continue
        }
        
        // Check if lead has opted out
        if (lead.opted_out) {
          console.log(`[send-followups] Lead ${lead.id} has opted out, skipping follow-up ${followUp.id}`)
          
          // Mark follow-up as cancelled
          const { error: cancelError } = await supabase
            .from('follow_ups')
            .update({ status: 'cancelled' })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[send-followups] Error cancelling follow-up for opted-out lead:', cancelError)
          }
          
          cancelled++
          continue
        }
        
        // Send SMS using the existing sendSms helper
        const messageSid = await sendSms(business, lead.caller_phone, followUp.message_body, {
          lead_id: lead.id,
          conversation_id: conversation.id,
        })

        if (!messageSid) {
          console.log(`[send-followups] Error - SMS failed to send: ${followUp.id}`)
          errors++
          continue
        }

        console.log(`[send-followups] SMS sent successfully: ${followUp.id}, SID: ${messageSid}`)

        // After successful send - update follow_up_job
        const { error: updateError } = await supabase
          .from('follow_up_jobs')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', followUp.id)
        
        if (updateError) {
          console.error('[followups] Error marking follow-up as sent:', updateError)
          throw updateError
        }
        console.log(`[followups] Follow-up sent successfully: ${followUp.id}`)
        sent++
        
        // Update conversation activity
        const { error: conversationUpdateError } = await supabase
          .from('conversations')
          .update({
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', conversation.id)
        
        if (conversationUpdateError) {
          console.error('[send-followups] Error updating conversation:', conversationUpdateError)
          throw conversationUpdateError
        }
        
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
export async function GET(req: NextRequest) {
  try {
    // Verify CRON_SECRET for cron job protection
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get('secret')
    const authHeader = req.headers.get('authorization')
    const cronHeader = req.headers.get('x-vercel-cron')

    const expectedSecret = process.env.CRON_SECRET
    if (!expectedSecret) {
      console.error('[Security] CRON_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const isAuthorized =
      cronHeader === '1' ||
      secret === expectedSecret ||
      authHeader === `Bearer ${expectedSecret}`

    if (!isAuthorized) {
      console.error('[Security] Unauthorized request to /api/cron/send-followups GET')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Cron] Authorized cron request to /api/cron/send-followups GET');
    console.log('[cron] Manual trigger authorized:', secret === expectedSecret);
    console.log('[send-followups] GET request - processing follow-ups')

    // For GET, also process follow-ups (same logic as POST)
    const now = new Date().toISOString()
    const { data: dueFollowUps, error: followUpsError } = await supabase
      .from('follow_up_jobs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
    
    if (followUpsError) {
      console.error('[send-followups] Error fetching due follow-ups:', followUpsError)
      throw followUpsError
    }
    
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
        const { data: conversation, error: conversationError } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', followUp.conversation_id)
          .single()
        
        if (conversationError) {
          console.error('[send-followups] Error fetching conversation:', conversationError)
          throw conversationError
        }
        
        // If conversation missing or conversation.status != 'open'
        if (!conversation || conversation.status !== 'open') {
          console.log(`[send-followups] Cancelling - conversation not open: ${followUp.id}`)
          
          // Mark follow_up as `cancelled`
          const { error: cancelError } = await supabase
            .from('follow_ups')
            .update({ status: 'cancelled' })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[send-followups] Error cancelling follow-up:', cancelError)
            throw cancelError
          }
          cancelled++
          continue
        }
        
        // Check whether the customer already replied
        let query = supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', followUp.conversation_id)
          .eq('direction', 'inbound')
          .order('created_at', { ascending: false })
          .limit(1)
        
        if (followUp.created_at) {
          query = query.gt('created_at', followUp.created_at)
        }
        
        const { data: latestInboundMessage, error: messageError } = await query.single()
        
        if (messageError && messageError.code !== 'PGRST116') { // PGRST116 is "not found" error
          console.error('[send-followups] Error fetching latest inbound message:', messageError)
          throw messageError
        }
        
        // If found
        if (latestInboundMessage) {
          console.log(`[send-followups] Cancelling - customer already replied: ${followUp.id}`)
          
          // Mark follow_up as `cancelled`
          const { error: cancelError } = await supabase
            .from('follow_ups')
            .update({ status: 'cancelled' })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[send-followups] Error cancelling follow-up:', cancelError)
            throw cancelError
          }
          cancelled++
          continue
        }
        
        // If still valid - fetch lead and business
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('*')
          .eq('id', conversation.lead_id)
          .single()
        
        if (leadError) {
          console.error('[send-followups] Error fetching lead:', leadError)
          throw leadError
        }
        
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', followUp.business_id)
          .single()
        
        if (businessError) {
          console.error('[send-followups] Error fetching business:', businessError)
          throw businessError
        }
        
        if (!lead || !business) {
          console.log(`[send-followups] Error - missing lead or business: ${followUp.id}`)
          errors++
          continue
        }
        
        // Check if lead has opted out
        if (lead.opted_out) {
          console.log(`[send-followups] Lead ${lead.id} has opted out, skipping follow-up ${followUp.id}`)
          
          // Mark follow-up as cancelled
          const { error: cancelError } = await supabase
            .from('follow_ups')
            .update({ status: 'cancelled' })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[send-followups] Error cancelling follow-up for opted-out lead:', cancelError)
          }
          
          cancelled++
          continue
        }
        
        // Send SMS using the existing sendSms helper
        const messageSid = await sendSms(business, lead.caller_phone, followUp.message_body, {
          lead_id: lead.id,
          conversation_id: conversation.id,
        })

        if (!messageSid) {
          console.log(`[send-followups] Error - SMS failed to send: ${followUp.id}`)
          errors++
          continue
        }

        console.log(`[send-followups] SMS sent successfully: ${followUp.id}, SID: ${messageSid}`)

        // After successful send - update follow_up_job
        const { error: updateError } = await supabase
          .from('follow_up_jobs')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', followUp.id)
        
        if (updateError) {
          console.error('[followups] Error marking follow-up as sent:', updateError)
          throw updateError
        }
        console.log(`[followups] Follow-up sent successfully: ${followUp.id}`)
        sent++
        
        // Update conversation activity
        const { error: conversationUpdateError } = await supabase
          .from('conversations')
          .update({
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', conversation.id)
        
        if (conversationUpdateError) {
          console.error('[send-followups] Error updating conversation:', conversationUpdateError)
          throw conversationUpdateError
        }
        
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

    const err = error as { message?: string }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        errorDetails: [err.message]
      },
      { status: 500 }
    )
  }
}
