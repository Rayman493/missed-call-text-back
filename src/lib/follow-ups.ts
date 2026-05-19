import { db } from '@/lib/supabase/admin'

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
  console.warn('[QA - Follow Ups] Could not find business hours slot within 2 weeks, using original time')
  return date
}

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
  
  // Fetch business settings for timezone and business hours
  const business = await db.getBusiness(businessId)
  if (!business) {
    console.error('[QA - Follow Ups] Business not found, cannot create follow-ups:', businessId)
    return []
  }
  
  const businessTimezone = business.business_hours_timezone || 'America/New_York'
  const businessHoursEnabled = business.business_hours_enabled || false
  
  console.log('[QA - Follow Ups] Initial evaluation:', {
    businessId,
    leadId,
    conversationId,
    businessTimezone,
    businessHoursEnabled,
    currentTimeUTC: new Date().toISOString(),
    currentTimeLocal: new Date().toLocaleString('en-US', { timeZone: businessTimezone })
  })
  
  const jobs = []
  const now = new Date()
  
  for (const followUp of FOLLOW_UP_SCHEDULE) {
    const idempotencyKey = `${leadId}-${followUp.step}`
    
    try {
      // Check if follow-up already exists to prevent duplicates
      const existingJob = await db.getFollowUpJobByIdempotencyKey(idempotencyKey)
      
      if (existingJob) {
        console.log(`[QA - Follow Ups] Duplicate prevented for lead ${leadId}, step ${followUp.step}`)
        continue
      }
      
      // Calculate initial scheduled time
      let scheduledFor = new Date(now.getTime() + followUp.delayMinutes * 60 * 1000)
      let action = 'CREATE'
      let reason = 'Normal scheduling'
      
      // Enforce business hours if enabled
      if (businessHoursEnabled) {
        const isDuringHours = isDuringBusinessHours(scheduledFor, businessTimezone)
        
        console.log('[QA - Follow Ups] Business hours check:', {
          step: followUp.step,
          delayMinutes: followUp.delayMinutes,
          originalScheduledUTC: scheduledFor.toISOString(),
          originalScheduledLocal: scheduledFor.toLocaleString('en-US', { timeZone: businessTimezone }),
          isDuringHours,
          businessHoursEnabled
        })
        
        if (!isDuringHours) {
          // Reschedule to next business hours slot
          const adjustedTime = getNextBusinessHoursSlot(scheduledFor, businessTimezone)
          scheduledFor = adjustedTime
          action = 'RESCHEDULE'
          reason = 'Outside business hours, rescheduled to next valid slot'
          
          console.log('[QA - Follow Ups] Rescheduled:', {
            step: followUp.step,
            adjustedScheduledUTC: scheduledFor.toISOString(),
            adjustedScheduledLocal: scheduledFor.toLocaleString('en-US', { timeZone: businessTimezone }),
            reason
          })
        }
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
        console.log(`[QA - Follow Ups] Job created: ${job.id}, step ${followUp.step}, action: ${action}, reason: ${reason}`)
        jobs.push(job)
      } else {
        console.error(`[QA - Follow Ups] Failed to create job for lead ${leadId}, step ${followUp.step}`)
      }
    } catch (error) {
      console.error(`[QA - Follow Ups] Error creating job for lead ${leadId}, step ${followUp.step}:`, error)
    }
  }
  
  console.log(`[QA - Follow Ups] Summary: Created ${jobs.length} jobs for lead ${leadId}`)
  console.log(`[QA - Follow Ups] Business hours enforcement: ${businessHoursEnabled ? 'ENABLED' : 'DISABLED'}`)
  console.log(`[QA - Follow Ups] Timezone: ${businessTimezone}`)
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
