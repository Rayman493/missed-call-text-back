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
  console.warn('[FollowUps] Could not find business hours slot within 2 weeks, using original time')
  return date
}

// Get follow-up configuration from business settings
export async function getFollowUpSchedule(businessId: string): Promise<Array<{
  step: number;
  delayMinutes: number;
  message: string;
}>> {
  try {
    const business = await db.getBusiness(businessId)
    if (!business) {
      console.error('[FollowUps] Business not found:', businessId)
      return []
    }

    const automationSettings = business.automation_settings || {}
    const followUpSettings = automationSettings.followUps

    // If no custom settings, use defaults
    if (!followUpSettings || !followUpSettings.enabled) {
      return []
    }

    // Convert saved settings to schedule format
    return (followUpSettings.followUps || [])
      .filter((fu: any) => fu.enabled)
      .map((fu: any) => ({
        step: fu.step,
        delayMinutes: fu.delayDays * 24 * 60, // Convert days to minutes
        message: fu.message.replace('{{businessName}}', business.name || 'My Business')
      }))
  } catch (error) {
    console.error('[FollowUps] Error getting follow-up schedule:', error)
    return []
  }
}

// Follow-up configuration (fallback defaults)
export const DEFAULT_FOLLOW_UP_SCHEDULE = [
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
    console.error('[FollowUps] Business not found, cannot create follow-ups:', businessId)
    return []
  }
  
  const businessTimezone = business.business_hours_timezone || 'America/New_York'
  const businessHoursEnabled = business.business_hours_enabled || false
  
  const jobs = []
  const now = new Date()
  
  // Get follow-up schedule from business settings
  const followUpSchedule = await getFollowUpSchedule(businessId)
  
  // If no follow-ups are configured, don't create jobs
  if (followUpSchedule.length === 0) {
    console.log('[FollowUps] No follow-up schedule configured for business:', businessId)
    return []
  }

  for (const followUp of followUpSchedule) {
    const idempotencyKey = `${leadId}-${followUp.step}`
    
    try {
      // Check if follow-up already exists to prevent duplicates
      const existingJob = await db.getFollowUpJobByIdempotencyKey(idempotencyKey)
      
      if (existingJob) {
        console.log(`[FollowUps] Duplicate prevented for lead ${leadId}, step ${followUp.step}`)
        continue
      }
      
      // Calculate initial scheduled time
      let scheduledFor = new Date(now.getTime() + followUp.delayMinutes * 60 * 1000)
      let action = 'CREATE'
      let reason = 'Normal scheduling'
      
      // Enforce business hours if enabled
      if (businessHoursEnabled) {
        const isDuringHours = isDuringBusinessHours(scheduledFor, businessTimezone)
        
        if (!isDuringHours) {
          // Reschedule to next business hours slot
          const adjustedTime = getNextBusinessHoursSlot(scheduledFor, businessTimezone)
          scheduledFor = adjustedTime
          action = 'RESCHEDULE'
          reason = 'Outside business hours, rescheduled to next valid slot'
          console.log(`[FollowUps] Rescheduled step ${followUp.step} to business hours`)
        }
      }
      
      const messageBody = followUp.message
      
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
        jobs.push(job)
      } else {
        console.error(`[FollowUps] Failed to create job for lead ${leadId}, step ${followUp.step}`)
      }
    } catch (error) {
      console.error(`[FollowUps] Error creating job for lead ${leadId}, step ${followUp.step}:`, error)
    }
  }
  
  console.log(`[FollowUps] Created ${jobs.length} jobs for lead ${leadId}`)
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
