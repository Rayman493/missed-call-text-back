import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/twilio'
import { db } from '@/lib/supabase/admin'
import { checkCronRateLimit } from '@/lib/rate-limit'
import { notificationService } from '@/lib/notifications'

// Helper function to check if a date is during business hours
function isDuringBusinessHours(date: Date, timezone: string): boolean {
  const localTime = new Date(date.toLocaleString('en-US', { timeZone: timezone }))
  const localHour = localTime.getHours()
  const localDay = localTime.getDay() // 0 = Sunday, 6 = Saturday
  
  // Business hours: 9 AM - 6 PM, Mon-Fri
  const isWeekday = localDay >= 1 && localDay <= 5 // Monday = 1, Friday = 5
  const isBusinessHour = localHour >= 9 && localHour < 18 // 9 AM - 6 PM (exclusive of 6 PM)
  
  return isWeekday && isBusinessHour
}

// Helper function to find next business hours slot
function getNextBusinessHoursSlot(date: Date, timezone: string): Date {
  let candidate = new Date(date)
  const maxIterations = 14 * 24 // prevent infinite loops (max 2 weeks ahead)
  let iterations = 0
  
  while (iterations < maxIterations) {
    iterations++
    if (isDuringBusinessHours(candidate, timezone)) {
      return candidate
    }
    // Move to next hour
    candidate = new Date(candidate.getTime() + 60 * 60 * 1000)
  }
  
  // Fallback: return original date if we can't find a slot
  console.warn('[Cron] Could not find business hours slot within 2 weeks, using original time')
  return date
}

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
    console.log('[cron] Manual trigger authorized:', secret === expectedSecret ? 'true' : 'false'); // Don't log the actual secret
    
    // Rate limiting check (secret-based)
    const rateLimitResult = await checkCronRateLimit(expectedSecret);
    if (!rateLimitResult.success) {
      console.warn('[Cron] Rate limit exceeded');
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.reset },
        { 
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.reset.toString(),
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          }
        }
      );
    }
    
    console.log('[send-followups] Starting follow-up processing')
    
    // Clean up old failed follow-up jobs to prevent UI pollution
    try {
      const cleanedCount = await db.cleanupOldFailedFollowUpJobs(7) // Clean up jobs older than 7 days
      if (cleanedCount > 0) {
        console.log(`[send-followups] Cleaned up ${cleanedCount} old failed follow-up jobs`)
      }
    } catch (cleanupError) {
      console.error('[send-followups] Error cleaning up old failed follow-up jobs:', cleanupError)
      // Don't fail the entire process for cleanup errors
    }
    
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
        console.log(`[send-followups] followUp: ${followUp.id}`)
        console.log(`[send-followups] lead_id: ${followUp.lead_id}`)
        console.log(`[send-followups] conversation lookup by lead_id only`)
        
        // Guard: ensure lead_id exists
        if (!followUp.lead_id) {
          console.error(`[send-followups] Missing lead_id for follow-up: ${followUp.id}`)
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'Missing lead_id'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[send-followups] Error marking follow-up as failed:', failError)
          }
          errors++
          continue
        }
        
        // Get open conversation for this lead (safe lookup by lead_id only)
        const { data: conversation, error: conversationError } = await supabase
          .from('conversations')
          .select('*')
          .eq('lead_id', followUp.lead_id)
          .eq('status', 'open')
          .maybeSingle()
        
        if (conversationError) {
          console.error(`[send-followups] Error fetching conversation for lead: ${followUp.lead_id}:`, conversationError)
        }
        
        if (!conversation) {
          console.warn(`[send-followups] No open conversation found for lead: ${followUp.lead_id}, proceeding without conversation`)
        } else {
          console.log(`[send-followups] Found conversation: ${conversation.id} for lead: ${followUp.lead_id}`)
        }
        
        // Check whether the customer already replied after follow-up was created
        // Only check if we have a conversation, otherwise proceed with follow-up
        let latestInboundMessage = null
        if (conversation) {
          const { data: messageData, error: messageError } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversation.id)
            .eq('direction', 'inbound')
            .gt('created_at', followUp.created_at)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          
          if (messageError && messageError.code !== 'PGRST116') { // PGRST116 is "not found" error
            console.error('[send-followups] Error checking for replies:', messageError)
          }
          
          latestInboundMessage = messageData
        }
        
        // If customer replied, cancel follow-up
        if (latestInboundMessage) {
          console.log(`[send-followups] Customer replied, cancelling follow-up: ${followUp.id}`)
          
          const { error: cancelError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'cancelled',
              cancelled_reason: 'customer_replied',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[send-followups] Error cancelling follow-up:', cancelError)
          }
          cancelled++
          continue
        }
        
        // If still valid - fetch lead and business using lead_id as source of truth
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('*')
          .eq('id', followUp.lead_id)
          .single()
        
        if (leadError) {
          console.error('[send-followups] Error fetching lead:', leadError)
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'Failed to fetch lead'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[send-followups] Error marking follow-up as failed:', failError)
          }
          errors++
          continue
        }
        
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', followUp.business_id)
          .single()
        
        if (businessError) {
          console.error('[send-followups] Error fetching business:', businessError)
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'Failed to fetch business'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[send-followups] Error marking follow-up as failed:', failError)
          }
          errors++
          continue
        }
        
        if (!lead || !business) {
          console.error(`[send-followups] Missing lead or business for follow-up: ${followUp.id}`)
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'Missing lead or business'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[send-followups] Error marking follow-up as failed:', failError)
          }
          errors++
          continue
        }
        
        console.log(`[send-followups] Found lead: ${lead.id}, business: ${business.id}`)
        
        // QA LOGGING: Track timezone and business hours for follow-up execution
        const businessTimezone = business.business_hours_timezone || 'America/New_York'
        const businessHoursEnabled = business.business_hours_enabled || false
        const now = new Date()
        const scheduledFor = new Date(followUp.scheduled_for)
        
        console.log('[QA - Follow Ups] Execution evaluation:', {
          followUpId: followUp.id,
          businessId: business.id,
          leadId: lead.id,
          conversationId: conversation?.id,
          businessTimezone,
          businessHoursEnabled,
          currentTimeUTC: now.toISOString(),
          currentTimeLocal: now.toLocaleString('en-US', { timeZone: businessTimezone }),
          scheduledForUTC: scheduledFor.toISOString(),
          scheduledForLocal: scheduledFor.toLocaleString('en-US', { timeZone: businessTimezone }),
          isDuringBusinessHours: isDuringBusinessHours(now, businessTimezone)
        })
        
        // Enforce business hours if enabled
        if (businessHoursEnabled) {
          const isDuringHours = isDuringBusinessHours(now, businessTimezone)
          
          if (!isDuringHours) {
            // Reschedule to next business hours slot
            const nextSlot = getNextBusinessHoursSlot(now, businessTimezone)
            
            console.log('[QA - Follow Ups] Rescheduling due to business hours:', {
              followUpId: followUp.id,
              currentUTC: now.toISOString(),
              currentLocal: now.toLocaleString('en-US', { timeZone: businessTimezone }),
              nextSlotUTC: nextSlot.toISOString(),
              nextSlotLocal: nextSlot.toLocaleString('en-US', { timeZone: businessTimezone }),
              reason: 'Outside business hours'
            })
            
            // Update job with new scheduled time
            const { error: updateError } = await supabase
              .from('follow_up_jobs')
              .update({
                scheduled_for: nextSlot.toISOString()
              })
              .eq('id', followUp.id)
            
            if (updateError) {
              console.error('[QA - Follow Ups] Error rescheduling follow-up:', updateError)
              errors++
            } else {
              console.log('[QA - Follow Ups] Successfully rescheduled follow-up:', followUp.id)
            }
            continue
          }
        }
        
        // Check if lead has opted out
        if (lead.opted_out) {
          console.log(`[send-followups] Lead ${lead.id} has opted out, skipping follow-up ${followUp.id}`)
          
          // Mark follow-up as cancelled
          const { error: cancelError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'cancelled',
              cancelled_reason: 'customer_opted_out',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[send-followups] Error cancelling follow-up for opted-out lead:', cancelError)
          }
          
          cancelled++
          continue
        }
        
        // Send SMS using the same sendSms helper as manual SMS
        console.log('[AUTO RESPONSE GENERATED]', {
          followUpId: followUp.id,
          leadId: lead.id,
          conversationId: conversation?.id,
          messageBody: followUp.message_body
        });

        console.log('[AUTO RESPONSE SEND START]', {
          leadId: lead.id,
          conversationId: conversation?.id,
          toPhone: lead.caller_phone,
          messagePreview: followUp.message_body.substring(0, 50) + '...'
        });

        const smsOptions: any = {
          lead_id: lead.id,
        }
        
        // Only include conversation_id if we have one
        if (conversation) {
          smsOptions.conversation_id = conversation.id
        }
        
        const messageSid = await sendSms(business, lead.caller_phone, followUp.message_body, smsOptions)

        if (!messageSid) {
          console.error('[AUTO RESPONSE MESSAGE INSERT ERROR]', {
            leadId: lead.id,
            conversationId: conversation?.id,
            error: 'SMS send failed - no Twilio message SID returned'
          })
          
          // Mark job as failed
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'SMS send failed - no Twilio message SID returned (check Vercel logs for details)'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[Follow-up SMS] Error marking follow-up as failed:', failError)
          }
          
          errors++
          continue
        }

        console.log('[AUTO RESPONSE TWILIO SENT]', {
          messageSid,
          leadId: lead.id,
          conversationId: conversation?.id
        })

        console.log('[AUTO RESPONSE MESSAGE INSERT SUCCESS]', {
          messageId: messageSid,
          leadId: lead.id,
          conversationId: conversation?.id
        })

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

        // Create notification for follow-up sent
        try {
          await notificationService.notifyFollowupSent(
            business.id,
            lead.caller_phone || 'Unknown',
            lead.id
          )
          console.log('[send-followups] Notification created for follow-up sent')
        } catch (error) {
          console.error('[send-followups] Error creating notification:', error)
        }
        
        // Update conversation activity only if conversation exists
        if (conversation) {
          const { error: conversationUpdateError } = await supabase
            .from('conversations')
            .update({
              last_activity_at: new Date().toISOString(),
            })
            .eq('id', conversation.id)
          
          if (conversationUpdateError) {
            console.error('[send-followups] Error updating conversation:', conversationUpdateError)
            // Don't throw - follow-up was sent successfully
          } else {
            console.log(`[send-followups] Updated conversation activity: ${conversation.id}`)
          }
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
    console.log('[cron] Manual trigger authorized:', secret === expectedSecret ? 'true' : 'false'); // Don't log the actual secret
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
        console.log(`[send-followups] followUp: ${followUp.id}`)
        console.log(`[send-followups] lead_id: ${followUp.lead_id}`)
        
        // Hard guard: ensure lead_id exists
        if (!followUp.lead_id) {
          console.error("[send-followups] Missing lead_id", followUp.id)
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'Missing lead_id'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[send-followups] Error marking follow-up as failed:', failError)
          }
          errors++
          continue
        }
        
        // Get open conversation for this lead (safe lookup by lead_id only)
        console.log("[send-followups] Looking up conversation by lead_id:", followUp.lead_id)
        const { data: conversation, error: conversationError } = await supabase
          .from('conversations')
          .select('*')
          .eq('lead_id', followUp.lead_id)
          .eq('status', 'open')
          .maybeSingle()
        
        if (conversationError) {
          console.error('[send-followups] Error fetching conversation:', conversationError)
        }
        
        if (!conversation) {
          console.warn(`[send-followups] No open conversation found for lead: ${followUp.lead_id}, proceeding without conversation`)
        } else {
          console.log(`[send-followups] Found conversation: ${conversation.id} for lead: ${followUp.lead_id}`)
        }
        
        // Check whether the customer already replied after follow-up was created
        // Only check if we have a conversation, otherwise proceed with follow-up
        let latestInboundMessage = null
        if (conversation) {
          const { data: messageData, error: messageError } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversation.id)
            .eq('direction', 'inbound')
            .gt('created_at', followUp.created_at)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          
          if (messageError && messageError.code !== 'PGRST116') { // PGRST116 is "not found" error
            console.error('[send-followups] Error checking for replies:', messageError)
          }
          
          latestInboundMessage = messageData
        }
        
        // If customer replied, cancel follow-up
        if (latestInboundMessage) {
          console.log(`[send-followups] Customer replied, cancelling follow-up: ${followUp.id}`)
          
          const { error: cancelError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'cancelled',
              cancelled_reason: 'customer_replied',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[send-followups] Error cancelling follow-up:', cancelError)
          }
          cancelled++
          continue
        }
        
        // If still valid - fetch lead and business using lead_id as source of truth
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('*')
          .eq('id', followUp.lead_id)
          .single()
        
        if (leadError) {
          console.error('[send-followups] Error fetching lead:', leadError)
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'Failed to fetch lead'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[send-followups] Error marking follow-up as failed:', failError)
          }
          errors++
          continue
        }
        
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', followUp.business_id)
          .single()
        
        if (businessError) {
          console.error('[send-followups] Error fetching business:', businessError)
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'Failed to fetch business'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[send-followups] Error marking follow-up as failed:', failError)
          }
          errors++
          continue
        }
        
        if (!lead || !business) {
          console.error(`[send-followups] Missing lead or business for follow-up: ${followUp.id}`)
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'Missing lead or business'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[send-followups] Error marking follow-up as failed:', failError)
          }
          errors++
          continue
        }
        
        console.log(`[send-followups] Found lead: ${lead.id}, business: ${business.id}`)
        
        // QA LOGGING: Track timezone and business hours for follow-up execution
        const businessTimezone = business.business_hours_timezone || 'America/New_York'
        const businessHoursEnabled = business.business_hours_enabled || false
        const now = new Date()
        const scheduledFor = new Date(followUp.scheduled_for)
        
        console.log('[QA - Follow Ups] Execution evaluation:', {
          followUpId: followUp.id,
          businessId: business.id,
          leadId: lead.id,
          conversationId: conversation?.id,
          businessTimezone,
          businessHoursEnabled,
          currentTimeUTC: now.toISOString(),
          currentTimeLocal: now.toLocaleString('en-US', { timeZone: businessTimezone }),
          scheduledForUTC: scheduledFor.toISOString(),
          scheduledForLocal: scheduledFor.toLocaleString('en-US', { timeZone: businessTimezone }),
          isDuringBusinessHours: isDuringBusinessHours(now, businessTimezone)
        })
        
        // Enforce business hours if enabled
        if (businessHoursEnabled) {
          const isDuringHours = isDuringBusinessHours(now, businessTimezone)
          
          if (!isDuringHours) {
            // Reschedule to next business hours slot
            const nextSlot = getNextBusinessHoursSlot(now, businessTimezone)
            
            console.log('[QA - Follow Ups] Rescheduling due to business hours:', {
              followUpId: followUp.id,
              currentUTC: now.toISOString(),
              currentLocal: now.toLocaleString('en-US', { timeZone: businessTimezone }),
              nextSlotUTC: nextSlot.toISOString(),
              nextSlotLocal: nextSlot.toLocaleString('en-US', { timeZone: businessTimezone }),
              reason: 'Outside business hours'
            })
            
            // Update job with new scheduled time
            const { error: updateError } = await supabase
              .from('follow_up_jobs')
              .update({
                scheduled_for: nextSlot.toISOString()
              })
              .eq('id', followUp.id)
            
            if (updateError) {
              console.error('[QA - Follow Ups] Error rescheduling follow-up:', updateError)
              errors++
            } else {
              console.log('[QA - Follow Ups] Successfully rescheduled follow-up:', followUp.id)
            }
            continue
          }
        }
        
        // Check if lead has opted out
        if (lead.opted_out) {
          console.log(`[send-followups] Lead ${lead.id} has opted out, skipping follow-up ${followUp.id}`)
          
          // Mark follow-up as cancelled
          const { error: cancelError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'cancelled',
              cancelled_reason: 'customer_opted_out',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', followUp.id)
          
          if (cancelError) {
            console.error('[send-followups] Error cancelling follow-up for opted-out lead:', cancelError)
          }
          
          cancelled++
          continue
        }
        
        // Send SMS using the same sendSms helper as manual SMS
        console.log('[AUTO RESPONSE GENERATED]', {
          followUpId: followUp.id,
          leadId: lead.id,
          conversationId: conversation?.id,
          messageBody: followUp.message_body
        });

        console.log('[AUTO RESPONSE SEND START]', {
          leadId: lead.id,
          conversationId: conversation?.id,
          toPhone: lead.caller_phone,
          messagePreview: followUp.message_body.substring(0, 50) + '...'
        });

        const smsOptions: any = {
          lead_id: lead.id,
        }
        
        // Only include conversation_id if we have one
        if (conversation) {
          smsOptions.conversation_id = conversation.id
        }
        
        const messageSid = await sendSms(business, lead.caller_phone, followUp.message_body, smsOptions)

        if (!messageSid) {
          console.error('[AUTO RESPONSE MESSAGE INSERT ERROR]', {
            leadId: lead.id,
            conversationId: conversation?.id,
            error: 'SMS send failed - no Twilio message SID returned'
          })
          
          // Mark job as failed
          const { error: failError } = await supabase
            .from('follow_up_jobs')
            .update({ 
              status: 'failed',
              last_error_message: 'SMS send failed - no Twilio message SID returned (check Vercel logs for details)'
            })
            .eq('id', followUp.id)
          
          if (failError) {
            console.error('[Follow-up SMS] Error marking follow-up as failed:', failError)
          }
          
          errors++
          continue
        }

        console.log('[AUTO RESPONSE TWILIO SENT]', {
          messageSid,
          leadId: lead.id,
          conversationId: conversation?.id
        })

        console.log('[AUTO RESPONSE MESSAGE INSERT SUCCESS]', {
          messageId: messageSid,
          leadId: lead.id,
          conversationId: conversation?.id
        })

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

        // Create notification for follow-up sent
        try {
          await notificationService.notifyFollowupSent(
            business.id,
            lead.caller_phone || 'Unknown',
            lead.id
          )
          console.log('[send-followups] Notification created for follow-up sent')
        } catch (error) {
          console.error('[send-followups] Error creating notification:', error)
        }
        
        // Update conversation activity only if conversation exists
        if (conversation) {
          const { error: conversationUpdateError } = await supabase
            .from('conversations')
            .update({
              last_activity_at: new Date().toISOString(),
            })
            .eq('id', conversation.id)
          
          if (conversationUpdateError) {
            console.error('[send-followups] Error updating conversation:', conversationUpdateError)
            // Don't throw - follow-up was sent successfully
          } else {
            console.log(`[send-followups] Updated conversation activity: ${conversation.id}`)
          }
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
