import { db } from '@/lib/supabase/admin'

// Follow-up configuration
export const FOLLOW_UP_SCHEDULE = [
  {
    step: 1,
    delayMinutes: 30, // 30 minutes after missed call
    message: (businessName: string) => `Just checking in from ${businessName || 'My Business'} - would you still like help?`
  },
  {
    step: 2,
    delayMinutes: 24 * 60, // 24 hours after missed call
    message: (businessName: string) => `Hi, this is ${businessName || 'My Business'}. We wanted to follow up one more time. Reply here if you still need anything.`
  }
]

export async function createFollowUpJobs(params: {
  businessId: string
  leadId: string
  conversationId?: string
  businessName?: string
}) {
  const { businessId, leadId, conversationId, businessName } = params
  
  console.log('[FollowUps] Creating follow-up jobs for lead:', leadId)
  
  // QA LOGGING: Fetch business settings for timezone and business hours
  const business = await db.getBusiness(businessId)
  const businessTimezone = business?.business_hours_timezone || 'America/New_York'
  const businessHoursEnabled = business?.business_hours_enabled || false
  const now = new Date()
  
  console.log('[QA - Follow Ups] Initial evaluation:', {
    businessId,
    leadId,
    conversationId,
    businessTimezone,
    businessHoursEnabled,
    currentTimeUTC: now.toISOString(),
    currentTimeLocal: now.toLocaleString('en-US', { timeZone: businessTimezone })
  })
  
  const jobs = []
  
  for (const followUp of FOLLOW_UP_SCHEDULE) {
    const scheduledFor = new Date(now.getTime() + followUp.delayMinutes * 60 * 1000)
    const idempotencyKey = `${leadId}-${followUp.step}`
    
    console.log('[QA - Follow Ups] Scheduling follow-up:', {
      step: followUp.step,
      delayMinutes: followUp.delayMinutes,
      scheduledForUTC: scheduledFor.toISOString(),
      scheduledForLocal: scheduledFor.toLocaleString('en-US', { timeZone: businessTimezone }),
      businessHoursConsidered: false, // CRITICAL: Business hours NOT currently enforced
      timezoneConsidered: false // CRITICAL: Timezone NOT currently used for scheduling
    })
    
    try {
      // Check if follow-up already exists to prevent duplicates
      const existingJob = await db.getFollowUpJobByIdempotencyKey(idempotencyKey)
      
      if (existingJob) {
        console.log(`[QA - Follow Ups] Duplicate prevented for lead ${leadId}, step ${followUp.step}`)
        continue
      }
      
      const messageBody = followUp.message(businessName || 'My Business')
      
      const job = await db.createFollowUpJob({
        lead_id: leadId,
        business_id: businessId,
        conversation_id: conversationId,
        message_body: messageBody,
        status: 'pending',
        scheduled_for: scheduledFor.toISOString(),
        idempotency_key: idempotencyKey,
        step: followUp.step,
        created_at: now.toISOString()
      })
      
      if (job) {
        console.log(`[QA - Follow Ups] Job created: ${job.id}, step ${followUp.step}, scheduled for ${scheduledFor.toISOString()}`)
        jobs.push(job)
      } else {
        console.error(`[QA - Follow Ups] Failed to create job for lead ${leadId}, step ${followUp.step}`)
      }
    } catch (error) {
      console.error(`[QA - Follow Ups] Error creating job for lead ${leadId}, step ${followUp.step}:`, error)
    }
  }
  
  console.log(`[QA - Follow Ups] Summary: Created ${jobs.length} jobs for lead ${leadId}`)
  console.log(`[QA - Follow Ups] CRITICAL WARNING: Follow-ups do NOT respect business timezone or business hours`)
  return jobs
}

export async function cancelPendingFollowUpsForLead(leadId: string, reason: string) {
  console.log(`[FollowUps] Canceling pending follow-ups for lead: ${leadId}, reason: ${reason}`)
  
  try {
    const cancelled = await db.cancelPendingFollowUpJobsForLead(leadId, reason)
    console.log(`[FollowUps] Cancelled ${cancelled} pending follow-ups for lead: ${leadId}`)
    return cancelled
  } catch (error) {
    console.error(`[FollowUps] Error canceling follow-ups for lead ${leadId}:`, error)
    return 0
  }
}

export async function cancelPendingFollowUpsForConversation(conversationId: string, reason: string) {
  console.log(`[FollowUps] Canceling pending follow-ups for conversation: ${conversationId}, reason: ${reason}`)
  
  try {
    const cancelled = await db.cancelPendingFollowUpsForConversation(conversationId)
    console.log(`[FollowUps] Cancelled ${cancelled} pending follow-ups for conversation: ${conversationId}`)
    return cancelled
  } catch (error) {
    console.error(`[FollowUps] Error canceling follow-ups for conversation ${conversationId}:`, error)
    return 0
  }
}
