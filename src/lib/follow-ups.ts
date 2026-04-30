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
  
  const jobs = []
  const now = new Date()
  
  for (const followUp of FOLLOW_UP_SCHEDULE) {
    const scheduledFor = new Date(now.getTime() + followUp.delayMinutes * 60 * 1000)
    const idempotencyKey = `${leadId}-${followUp.step}`
    
    try {
      // Check if follow-up already exists to prevent duplicates
      const existingJob = await db.getFollowUpJobByIdempotencyKey(idempotencyKey)
      
      if (existingJob) {
        console.log(`[FollowUps] Follow-up already exists for lead ${leadId}, step ${followUp.step}, skipping`)
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
        console.log(`[FollowUps] Created follow-up job: ${job.id}, step ${followUp.step}, scheduled for ${scheduledFor.toISOString()}`)
        jobs.push(job)
      } else {
        console.error(`[FollowUps] Failed to create follow-up job for lead ${leadId}, step ${followUp.step}`)
      }
    } catch (error) {
      console.error(`[FollowUps] Error creating follow-up job for lead ${leadId}, step ${followUp.step}:`, error)
    }
  }
  
  console.log(`[FollowUps] Created ${jobs.length} follow-up jobs for lead: ${leadId}`)
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
