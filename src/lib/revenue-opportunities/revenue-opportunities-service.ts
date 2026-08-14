/**
 * Revenue Opportunities Service
 * 
 * Identifies customers representing immediate revenue opportunities.
 * Scores opportunities 0-100 based on multiple factors.
 */

import { createBrowserClient } from '@/lib/supabase/browser'
import type {
  RevenueOpportunity,
  RevenueOpportunitiesContext,
  RevenueOpportunitiesServiceInterface,
  OpportunityType,
  OpportunityAction
} from './revenue-opportunities-types'

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

class RevenueOpportunitiesService implements RevenueOpportunitiesServiceInterface {
  private cache: Map<string, { opportunities: RevenueOpportunity[]; timestamp: number }> = new Map()

  /**
   * Get revenue opportunities for a business
   */
  async getOpportunities(context: RevenueOpportunitiesContext): Promise<RevenueOpportunity[]> {
    const cacheKey = this.getCacheKey(context)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.opportunities
    }

    const supabase = createBrowserClient()
    const opportunities: RevenueOpportunity[] = []

    // 1. Ready for Estimate - Customers with completed intake but no estimate/job
    const estimateOpportunities = await this.findReadyForEstimateOpportunities(context.businessId, supabase)
    opportunities.push(...estimateOpportunities)

    // 2. Ready for Invoice - Completed jobs without payment requested
    const invoiceOpportunities = await this.findReadyForInvoiceOpportunities(context.businessId, supabase)
    opportunities.push(...invoiceOpportunities)

    // 3. Repeat Customer - Completed work, hasn't booked again within normal interval
    const repeatOpportunities = await this.findRepeatCustomerOpportunities(context.businessId, supabase)
    opportunities.push(...repeatOpportunities)

    // 4. Follow-Up - Customer quiet, Business Memory suggests they usually respond
    const followUpOpportunities = await this.findFollowUpOpportunities(context.businessId, supabase)
    opportunities.push(...followUpOpportunities)

    // 5. Seasonal - Seasonal services, season approaching (placeholder for future expansion)
    // const seasonalOpportunities = await this.findSeasonalOpportunities(context.businessId, supabase)
    // opportunities.push(...seasonalOpportunities)

    // Sort by score (highest first) and take top 5
    const sortedOpportunities = opportunities
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, 5)

    this.cache.set(cacheKey, { opportunities: sortedOpportunities, timestamp: Date.now() })

    return sortedOpportunities
  }

  /**
   * Get opportunity for a specific customer
   */
  async getOpportunity(context: RevenueOpportunitiesContext): Promise<RevenueOpportunity | null> {
    if (!context.customerId) return null

    const opportunities = await this.getOpportunities(context)
    return opportunities.find(o => o.customerId === context.customerId) || null
  }

  /**
   * Invalidate cached opportunities for a business
   */
  invalidateCache(businessId: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.startsWith(businessId)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Find customers ready for estimate (completed intake, no estimate/job)
   */
  private async findReadyForEstimateOpportunities(
    businessId: string,
    supabase: any
  ): Promise<RevenueOpportunity[]> {
    const { data: allLeads } = await supabase
      .from('leads')
      .select('id, phone, raw_metadata')
      .eq('business_id', businessId)

    // Filter for leads with AI intake data (stored in raw_metadata)
    const leads = allLeads?.filter((lead: any) => {
      const rawMetadata = lead.raw_metadata || {}
      // Check for AI intake completion flags
      return rawMetadata.ai_intake_completed === true ||
             rawMetadata.ai_intake_partial === true ||
             rawMetadata.ai_intake_latest_call_sid ||
             rawMetadata.extracted_info ||
             rawMetadata.ai_intake
    }) || []

    if (!leads || leads.length === 0) return []

    const leadIds = leads.map((l: any) => l.id)

    // Check which leads have jobs
    const { data: jobs } = await supabase
      .from('jobs')
      .select('lead_id')
      .eq('business_id', businessId)
      .in('lead_id', leadIds)

    const leadsWithJobs = new Set((jobs || []).map((j: any) => j.lead_id))
    const leadsWithoutJobs = leads.filter((l: any) => !leadsWithJobs.has(l.id))

    return leadsWithoutJobs.map((lead: any) => {
      const opportunity = this.createOpportunity({
        customerId: lead.id,
        customerName: this.getCustomerName(lead),
        type: 'ready_for_estimate',
        estimatedValue: null,
        whyNow: 'Completed intake, no estimate or job created yet',
        recommendedAction: 'send_estimate',
        metadata: {
          daysSinceLastInteraction: 0,
          completedIntake: true,
          hasEstimate: false,
          hasJob: false,
          hasPaymentRequest: false
        }
      })

      return opportunity
    })
  }

  /**
   * Find jobs ready for invoice (completed, no payment requested)
   */
  private async findReadyForInvoiceOpportunities(
    businessId: string,
    supabase: any
  ): Promise<RevenueOpportunity[]> {
    const { data: completedJobs } = await supabase
      .from('jobs')
      .select('id, lead_id, estimated_amount, completed_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')

    if (!completedJobs || completedJobs.length === 0) return []

    const jobIds = completedJobs.map((j: any) => j.id)

    // Check which jobs have payment requests
    const { data: payments } = await supabase
      .from('payment_requests')
      .select('job_id')
      .eq('business_id', businessId)
      .in('job_id', jobIds)

    const jobsWithPayments = new Set((payments || []).map((p: any) => p.job_id))
    const jobsWithoutPayments = completedJobs.filter((j: any) => !jobsWithPayments.has(j.id))

    // Get lead information
    const leadIds = jobsWithoutPayments.map((j: any) => j.lead_id)
    const { data: leads } = await supabase
      .from('leads')
      .select('id, phone, raw_metadata')
      .eq('business_id', businessId)
      .in('id', leadIds)

    const leadsMap = new Map((leads || []).map((l: any) => [l.id, l]))

    return jobsWithoutPayments.map((job: any) => {
      const lead = leadsMap.get(job.lead_id)
      const daysSinceCompletion = job.completed_at
        ? Math.floor((Date.now() - new Date(job.completed_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0

      const opportunity = this.createOpportunity({
        customerId: job.lead_id,
        customerName: lead ? this.getCustomerName(lead) : 'Unknown',
        type: 'ready_for_invoice',
        estimatedValue: job.estimated_amount,
        whyNow: `Work completed ${daysSinceCompletion} days ago, no payment requested`,
        recommendedAction: 'request_payment',
        metadata: {
          lastJobDate: job.completed_at,
          daysSinceLastInteraction: daysSinceCompletion,
          completedIntake: false,
          hasEstimate: false,
          hasJob: true,
          hasPaymentRequest: false
        }
      })

      return opportunity
    })
  }

  /**
   * Find repeat customer opportunities
   */
  private async findRepeatCustomerOpportunities(
    businessId: string,
    supabase: any
  ): Promise<RevenueOpportunity[]> {
    // Get completed jobs grouped by lead
    const { data: completedJobs } = await supabase
      .from('jobs')
      .select('id, lead_id, estimated_amount, completed_at')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })

    if (!completedJobs || completedJobs.length === 0) return []

    // Group by lead
    const jobsByLead = new Map<string, any[]>()
    completedJobs.forEach((job: any) => {
      if (!jobsByLead.has(job.lead_id)) {
        jobsByLead.set(job.lead_id, [])
      }
      jobsByLead.get(job.lead_id)!.push(job)
    })

    // Find leads with multiple completed jobs
    const repeatLeads: string[] = []
    jobsByLead.forEach((jobs, leadId) => {
      if (jobs.length >= 2) {
        repeatLeads.push(leadId)
      }
    })

    if (repeatLeads.length === 0) return []

    // Get lead information
    const { data: leads } = await supabase
      .from('leads')
      .select('id, phone, raw_metadata')
      .eq('business_id', businessId)
      .in('id', repeatLeads)

    const opportunities: RevenueOpportunity[] = []

    for (const lead of leads || []) {
      const jobs = jobsByLead.get(lead.id) || []
      const lastJob = jobs[0] // Most recent (sorted descending)
      const secondLastJob = jobs[1]

      if (lastJob && secondLastJob) {
        const lastJobDate = new Date(lastJob.completed_at)
        const secondLastJobDate = new Date(secondLastJob.completed_at)
        const intervalDays = Math.floor((lastJobDate.getTime() - secondLastJobDate.getTime()) / (1000 * 60 * 60 * 24))
        const daysSinceLastJob = Math.floor((Date.now() - lastJobDate.getTime()) / (1000 * 60 * 60 * 24))

        // If overdue by more than 20% of normal interval
        if (daysSinceLastJob > intervalDays * 1.2) {
          const avgJobValue = jobs.reduce((sum: number, j: any) => sum + (j.estimated_amount || 0), 0) / jobs.length

          const opportunity = this.createOpportunity({
            customerId: lead.id,
            customerName: this.getCustomerName(lead),
            type: 'repeat_customer',
            estimatedValue: avgJobValue,
            whyNow: `Usually books every ${intervalDays} days, last job was ${daysSinceLastJob} days ago`,
            recommendedAction: 'schedule_job',
            metadata: {
              lastJobDate: lastJob.completed_at,
              normalInterval: intervalDays,
              daysSinceLastInteraction: daysSinceLastJob,
              completedIntake: false,
              hasEstimate: false,
              hasJob: true,
              hasPaymentRequest: false
            }
          })

          opportunities.push(opportunity)
        }
      }
    }

    return opportunities
  }

  /**
   * Find follow-up opportunities (customer quiet, Business Memory suggests they usually respond)
   */
  private async findFollowUpOpportunities(
    businessId: string,
    supabase: any
  ): Promise<RevenueOpportunity[]> {
    // Get leads with recent messages but no recent activity
    const { data: allLeads } = await supabase
      .from('leads')
      .select('id, phone, raw_metadata, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(50)

    // Filter for leads with AI intake data (stored in raw_metadata)
    const leads = allLeads?.filter((lead: any) => {
      const rawMetadata = lead.raw_metadata || {}
      // Check for AI intake completion flags
      return rawMetadata.ai_intake_completed === true ||
             rawMetadata.ai_intake_partial === true ||
             rawMetadata.ai_intake_latest_call_sid ||
             rawMetadata.extracted_info ||
             rawMetadata.ai_intake
    }) || []

    if (!leads || leads.length === 0) return []

    const opportunities: RevenueOpportunity[] = []

    for (const lead of leads || []) {
      const leadAge = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
      
      // Only consider leads older than 3 days but younger than 30 days
      if (leadAge > 3 && leadAge < 30) {
        // Check for recent messages
        const { data: messages } = await supabase
          .from('messages')
          .select('created_at, direction')
          .eq('business_id', businessId)
          .eq('conversation_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(1)

        const lastMessage = messages?.[0]
        const daysSinceLastMessage = lastMessage
          ? Math.floor((Date.now() - new Date(lastMessage.created_at).getTime()) / (1000 * 60 * 60 * 24))
          : leadAge

        // If no response in 7+ days
        if (daysSinceLastMessage >= 7) {
          const opportunity = this.createOpportunity({
            customerId: lead.id,
            customerName: this.getCustomerName(lead),
            type: 'follow_up',
            estimatedValue: null,
            whyNow: `Last activity was ${daysSinceLastMessage} days ago, customer usually responds`,
            recommendedAction: 'send_follow_up',
            metadata: {
              daysSinceLastInteraction: daysSinceLastMessage,
              completedIntake: true,
              hasEstimate: false,
              hasJob: false,
              hasPaymentRequest: false
            }
          })

          opportunities.push(opportunity)
        }
      }
    }

    return opportunities
  }

  /**
   * Create opportunity with calculated score
   */
  private createOpportunity(params: {
    customerId: string
    customerName: string
    type: OpportunityType
    estimatedValue: number | null
    whyNow: string
    recommendedAction: OpportunityAction
    metadata: any
  }): RevenueOpportunity {
    const score = this.calculateScore(params)

    return {
      id: `opp-${params.customerId}-${Date.now()}`,
      customerId: params.customerId,
      customerName: params.customerName,
      type: params.type,
      score,
      estimatedValue: params.estimatedValue,
      whyNow: params.whyNow,
      recommendedAction: params.recommendedAction,
      metadata: params.metadata
    }
  }

  /**
   * Calculate opportunity score (0-100)
   */
  private calculateScore(params: any): any {
    const factors = {
      expectedRevenue: 0,
      customerValue: 0,
      repeatHistory: 0,
      conversionLikelihood: 0,
      daysSinceLastInteraction: 0,
      businessMemoryConfidence: 0,
      outstandingWork: 0
    }

    // Expected revenue (0-25 points)
    if (params.estimatedValue) {
      factors.expectedRevenue = Math.min(25, params.estimatedValue / 20) // $500 = 25 points
    }

    // Customer value based on type (0-15 points)
    if (params.type === 'repeat_customer') {
      factors.customerValue = 15
    } else if (params.type === 'ready_for_invoice') {
      factors.customerValue = 12
    } else if (params.type === 'ready_for_estimate') {
      factors.customerValue = 10
    } else {
      factors.customerValue = 5
    }

    // Repeat history (0-15 points)
    if (params.type === 'repeat_customer') {
      factors.repeatHistory = 15
    } else {
      factors.repeatHistory = 0
    }

    // Conversion likelihood based on type (0-20 points)
    if (params.type === 'ready_for_invoice') {
      factors.conversionLikelihood = 20
    } else if (params.type === 'repeat_customer') {
      factors.conversionLikelihood = 18
    } else if (params.type === 'ready_for_estimate') {
      factors.conversionLikelihood = 15
    } else {
      factors.conversionLikelihood = 10
    }

    // Days since last interaction (0-15 points)
    // More recent = higher score
    const days = params.metadata.daysSinceLastInteraction
    if (days <= 7) {
      factors.daysSinceLastInteraction = 15
    } else if (days <= 14) {
      factors.daysSinceLastInteraction = 12
    } else if (days <= 30) {
      factors.daysSinceLastInteraction = 8
    } else if (days <= 60) {
      factors.daysSinceLastInteraction = 4
    } else {
      factors.daysSinceLastInteraction = 0
    }

    // Business Memory confidence (0-5 points)
    // If completed intake, higher confidence
    if (params.metadata.completedIntake) {
      factors.businessMemoryConfidence = 5
    } else {
      factors.businessMemoryConfidence = 2
    }

    // Outstanding work (0-5 points)
    if (params.metadata.hasJob && !params.metadata.hasPaymentRequest) {
      factors.outstandingWork = 5
    } else {
      factors.outstandingWork = 0
    }

    const totalScore = Object.values(factors).reduce((sum: number, val: number) => sum + val, 0)

    return {
      score: Math.min(100, Math.round(totalScore)),
      factors
    }
  }

  /**
   * Get customer name from lead data
   */
  private getCustomerName(lead: any): string {
    const aiIntake = lead.raw_metadata?.ai_intake || lead.raw_metadata
    if (aiIntake?.customerName) {
      return aiIntake.customerName
    }
    return lead.phone || 'Unknown'
  }

  /**
   * Generate cache key from context
   */
  private getCacheKey(context: RevenueOpportunitiesContext): string {
    const parts = [context.businessId]
    if (context.customerId) parts.push(context.customerId)
    return parts.join(':')
  }
}

// Singleton instance
export const revenueOpportunitiesService = new RevenueOpportunitiesService()
