import { db } from '@/lib/supabase/admin'
import { timelineEvents } from '@/lib/event-timeline'
import { getOutOfOfficeNotice } from '@/lib/out-of-office'

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
    console.log('[GET FOLLOWUP SCHEDULE START] =========================================');
    console.log('[GET FOLLOWUP SCHEDULE START] businessId:', businessId);
    console.log('[GET FOLLOWUP SCHEDULE START] Timestamp:', new Date().toISOString());
    console.log('[GET FOLLOWUP SCHEDULE START] =========================================');

    const business = await db.getBusiness(businessId)
    if (!business) {
      console.error('[GET FOLLOWUP SCHEDULE] Business not found:', businessId)
      return []
    }

    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] =========================================');
    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] businessId:', businessId);
    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] automation_settings:', JSON.stringify(business.automation_settings, null, 2));
    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] Timestamp:', new Date().toISOString());
    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] =========================================');

    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] =========================================');
    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] businessId:', businessId);
    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] automation_settings:', JSON.stringify(business.automation_settings, null, 2));
    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] rawBusinessRow:', JSON.stringify(business, null, 2));
    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] Timestamp:', new Date().toISOString());
    console.log('[GET FOLLOWUP SCHEDULE BUSINESS SETTINGS RAW] =========================================');

    const automationSettings = business.automation_settings || {}
    const followUpsContainer = automationSettings.followUps || {}
    const followUpSettings = followUpsContainer.followUps
    const followUpsEnabled = followUpsContainer.enabled !== false // Default to enabled if not set

    console.log('[FOLLOWUP SETTINGS LOADED] =========================================');
    console.log('[FOLLOWUP SETTINGS LOADED] businessId:', businessId);
    console.log('[FOLLOWUP SETTINGS LOADED] enabled:', followUpsEnabled);
    console.log('[FOLLOWUP SETTINGS LOADED] followUpsCount:', followUpSettings?.length || 0);
    console.log('[FOLLOWUP SETTINGS LOADED] Timestamp:', new Date().toISOString());
    console.log('[FOLLOWUP SETTINGS LOADED] =========================================');

    // If no custom settings or disabled, use defaults
    if (!followUpSettings || !followUpSettings.length || !followUpsEnabled) {
      console.log('[FOLLOWUP SKIP REASON] =========================================');
      console.log('[FOLLOWUP SKIP REASON] businessId:', businessId);
      console.log('[FOLLOWUP SKIP REASON] reason:', !followUpSettings ? 'followUpSettings is null/undefined' : !followUpSettings.length ? 'followUpSettings array is empty' : 'followUpsEnabled is false');
      console.log('[FOLLOWUP SKIP REASON] followUpsEnabled:', followUpsEnabled);
      console.log('[FOLLOWUP SKIP REASON] followUpSettingsLength:', followUpSettings?.length || 0);
      console.log('[FOLLOWUP SKIP REASON] Timestamp:', new Date().toISOString());
      console.log('[FOLLOWUP SKIP REASON] =========================================');
      return []
    }

    // Convert saved settings to schedule format
    const schedule = followUpSettings
      .filter((fu: any) => fu.enabled)
      .map((fu: any) => {
        // Convert delay based on unit
        let delayMinutes: number
        const delayValue = fu.delayDays || fu.delay || 0
        const delayUnit = fu.delayUnit || fu.unit || 'days'

        console.log('[FOLLOWUP DELAY CONVERSION]', {
          step: fu.step,
          delayValue,
          delayUnit,
          original: { delayDays: fu.delayDays, delay: fu.delay, delayUnit: fu.delayUnit, unit: fu.unit }
        })

        switch (delayUnit) {
          case 'minutes':
            delayMinutes = delayValue
            break
          case 'hours':
            delayMinutes = delayValue * 60
            break
          case 'days':
          default:
            delayMinutes = delayValue * 24 * 60
            break
        }

        console.log('[FOLLOWUP DELAY CONVERTED]', {
          step: fu.step,
          delayMinutes,
          delayValue,
          delayUnit,
          calculation: `${delayValue} ${delayUnit} = ${delayMinutes} minutes`
        })

        const result = {
          step: fu.step,
          delayMinutes,
          message: fu.message.replace('{{business_name}}', business.name || 'My Business')
        }

        console.log('[FOLLOWUP SCHEDULE ITEM]', {
          step: result.step,
          delayMinutes: result.delayMinutes,
          messagePreview: result.message.substring(0, 50)
        })

        return result
      })
    
    console.log('[GET FOLLOWUP SCHEDULE] Converted schedule:', { length: schedule.length, schedule });
    return schedule
  } catch (error) {
    console.error('[GET FOLLOWUP SCHEDULE] Error getting follow-up schedule:', error)
    return []
  }
}

// Follow-up configuration (fallback defaults)
export const DEFAULT_FOLLOW_UP_SCHEDULE = [
  {
    step: 1,
    delayMinutes: 30, // 30 minutes after missed call
    message: (businessName: string) => `Hi, this is ${businessName || 'My Business'}. We weren't able to get all the details we needed. Reply here if you'd still like help and we'll continue where we left off.`
  },
  {
    step: 2,
    delayMinutes: 24 * 60, // 24 hours after missed call
    message: (businessName: string) => `Hi, this is ${businessName || 'My Business'}. Just checking in one more time. If you'd still like assistance, simply reply to this message.`
  },
  {
    step: 3,
    delayMinutes: 48 * 60, // 48 hours after missed call
    message: (businessName: string) => `Hi, this is ${businessName || 'My Business'}. We'll close this request for now, but feel free to reply anytime if you still need help.`
  }
]

export async function createFollowUpJobs(params: {
  businessId: string
  leadId: string
  conversationId?: string
  businessName?: string
}) {
  const { businessId, leadId, conversationId, businessName } = params

  console.log('[FOLLOWUP CREATE CHECK] =========================================');
  console.log('[FOLLOWUP CREATE CHECK] businessId:', businessId);
  console.log('[FOLLOWUP CREATE CHECK] leadId:', leadId);
  console.log('[FOLLOWUP CREATE CHECK] conversationId:', conversationId);
  console.log('[FOLLOWUP CREATE CHECK] businessName:', businessName);
  console.log('[FOLLOWUP CREATE CHECK] Timestamp:', new Date().toISOString());
  console.log('[FOLLOWUP CREATE CHECK] =========================================');
  
  // Fetch business settings for timezone and business hours
  const business = await db.getBusiness(businessId)
  if (!business) {
    console.error('[CREATE FOLLOWUPS] Business not found, cannot create follow-ups:', businessId)
    return []
  }

  console.log('[CREATE FOLLOWUPS BUSINESS]', { businessId, businessName: business.name });

  const businessTimezone = business.business_hours_timezone || 'America/New_York'
  const businessHoursEnabled = business.business_hours_enabled || false
  
  const jobs = []
  const now = new Date()
  
  // Get follow-up schedule from business settings
  console.log('[CREATE FOLLOWUPS] Fetching follow-up schedule');
  const followUpSchedule = await getFollowUpSchedule(businessId)
  
  console.log('[CREATE FOLLOWUPS SETTINGS]', { 
    businessId, 
    scheduleLength: followUpSchedule.length,
    schedule: followUpSchedule 
  });
  
  // If no follow-ups are configured, don't create jobs
  if (followUpSchedule.length === 0) {
    console.log('[CREATE FOLLOWUPS] No follow-up schedule configured for business:', businessId)
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
      
      const leadCreatedAt = now
      const initialScheduledFor = new Date(now.getTime() + followUp.delayMinutes * 60 * 1000)
      let scheduledFor = initialScheduledFor
      let action = 'CREATE'
      let reason = 'Normal scheduling'

      console.log('[FOLLOWUP SCHEDULE CALCULATION]', {
        step: followUp.step,
        leadCreatedAt: leadCreatedAt.toISOString(),
        delayMinutes: followUp.delayMinutes,
        initialScheduledFor: initialScheduledFor.toISOString(),
        businessHoursEnabled,
        businessTimezone
      })

      // Enforce business hours if enabled
      if (businessHoursEnabled) {
        const isDuringHours = isDuringBusinessHours(scheduledFor, businessTimezone)

        if (!isDuringHours) {
          // Reschedule to next business hours slot
          const adjustedTime = getNextBusinessHoursSlot(scheduledFor, businessTimezone)
          scheduledFor = adjustedTime
          action = 'RESCHEDULE'
          reason = 'Outside business hours, rescheduled to next valid slot'

          console.log('[FOLLOWUP BUSINESS HOURS ADJUSTMENT]', {
            step: followUp.step,
            originalScheduledFor: initialScheduledFor.toISOString(),
            adjustedScheduledFor: scheduledFor.toISOString(),
            reason,
            businessTimezone
          })
          console.log(`[FollowUps] Rescheduled step ${followUp.step} to business hours`)
        }
      }
      
      let messageBody = followUp.message

      // Append Out of Office notice if currently active
      const outOfOfficeNotice = getOutOfOfficeNotice(business)
      if (outOfOfficeNotice) {
        // Append before STOP wording to ensure compliance language remains at the end
        const stopIndex = messageBody.indexOf('Reply STOP')
        if (stopIndex !== -1) {
          // Insert Out of Office notice before STOP wording
          messageBody = messageBody.substring(0, stopIndex) + outOfOfficeNotice + '\n\n' + messageBody.substring(stopIndex)
        } else {
          // If no STOP wording found, append at the end
          messageBody = messageBody + '\n\n' + outOfOfficeNotice
        }
        console.log('[FOLLOWUP JOB] Out of Office notice appended', {
          businessId,
          leadId,
          step: followUp.step,
          notice: outOfOfficeNotice
        })
      }

      console.log('[FOLLOWUP JOB INSERT]', {
        step: followUp.step,
        delayDays: followUp.step,
        delayUnit: 'N/A',
        calculatedDelayMinutes: followUp.delayMinutes,
        leadCreatedAt: now.toISOString(),
        scheduledFor: scheduledFor.toISOString(),
        businessHoursEnabled,
        businessTimezone,
        messagePreview: messageBody?.substring(0, 50)
      })

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
        console.log('[FOLLOWUP JOBS INSERTED] =========================================');
        console.log('[FOLLOWUP JOBS INSERTED] businessId:', businessId);
        console.log('[FOLLOWUP JOBS INSERTED] leadId:', leadId);
        console.log('[FOLLOWUP JOBS INSERTED] jobId:', job.id);
        console.log('[FOLLOWUP JOBS INSERTED] step:', followUp.step);
        console.log('[FOLLOWUP JOBS INSERTED] scheduledFor:', scheduledFor.toISOString());

        // Create timeline event for job creation
        try {
          await timelineEvents.jobCreated(businessId, leadId, job.id, followUp.step, scheduledFor.toISOString())
          console.log('[FOLLOWUP JOBS INSERTED] Timeline event created successfully')
        } catch (timelineError) {
          console.error('[FOLLOWUP JOBS INSERTED] Failed to create timeline event:', timelineError)
          // Non-critical error, continue
        }
        console.log('[FOLLOWUP JOBS INSERTED] Timestamp:', new Date().toISOString());
        console.log('[FOLLOWUP JOBS INSERTED] =========================================');
      } else {
        console.error('[FOLLOWUP INSERT ERROR] =========================================');
        console.error('[FOLLOWUP INSERT ERROR] businessId:', businessId);
        console.error('[FOLLOWUP INSERT ERROR] leadId:', leadId);
        console.error('[FOLLOWUP INSERT ERROR] step:', followUp.step);
        console.error('[FOLLOWUP INSERT ERROR] reason: db.createFollowUpJob returned null');
        console.error('[FOLLOWUP INSERT ERROR] Timestamp:', new Date().toISOString());
        console.error('[FOLLOWUP INSERT ERROR] =========================================');
      }
    } catch (error) {
      console.error('[FOLLOWUP INSERT ERROR] =========================================');
      console.error('[FOLLOWUP INSERT ERROR] businessId:', businessId);
      console.error('[FOLLOWUP INSERT ERROR] leadId:', leadId);
      console.error('[FOLLOWUP INSERT ERROR] step:', followUp.step);
      console.error('[FOLLOWUP INSERT ERROR] error:', String(error));
      console.error('[FOLLOWUP INSERT ERROR] Timestamp:', new Date().toISOString());
      console.error('[FOLLOWUP INSERT ERROR] =========================================');
    }
  }

  console.log('[FOLLOWUP CREATION COMPLETE] =========================================');
  console.log('[FOLLOWUP CREATION COMPLETE] businessId:', businessId);
  console.log('[FOLLOWUP CREATION COMPLETE] leadId:', leadId);
  console.log('[FOLLOWUP CREATION COMPLETE] jobsCreated:', jobs.length);
  console.log('[FOLLOWUP CREATION COMPLETE] jobIds:', jobs.map(j => j.id));
  console.log('[FOLLOWUP CREATION COMPLETE] Timestamp:', new Date().toISOString());
  console.log('[FOLLOWUP CREATION COMPLETE] =========================================');
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
