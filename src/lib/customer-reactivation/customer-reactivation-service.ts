/**
 * Customer Reactivation Service
 * 
 * Identifies customers representing high-value reactivation opportunities.
 * Scores opportunities 0-100 based on multiple factors.
 */

import { createBrowserClient } from '@/lib/supabase/browser'
import type {
  CustomerReactivation,
  CustomerReactivationContext,
  CustomerReactivationServiceInterface,
  ReactivationType,
  ReactivationAction
} from './customer-reactivation-types'

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

class CustomerReactivationService implements CustomerReactivationServiceInterface {
  private cache: Map<string, { reactivations: CustomerReactivation[]; timestamp: number }> = new Map()

  /**
   * Get customer reactivations for a business
   */
  async getReactivations(context: CustomerReactivationContext): Promise<CustomerReactivation[]> {
    const cacheKey = this.getCacheKey(context)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.reactivations
    }

    const supabase = createBrowserClient()
    const reactivations: CustomerReactivation[] = []

    // Get all completed jobs to analyze customer history
    const { data: completedJobs } = await supabase
      .from('jobs')
      .select('id, lead_id, title')
      .eq('business_id', context.businessId)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })

    if (!completedJobs || completedJobs.length === 0) {
      return []
    }

    // Group jobs by lead
    const jobsByLead = new Map<string, any[]>()
    completedJobs.forEach((job: any) => {
      if (!jobsByLead.has(job.lead_id)) {
        jobsByLead.set(job.lead_id, [])
      }
      jobsByLead.get(job.lead_id)!.push(job)
    })

    // Get lead information
    const leadIds = Array.from(jobsByLead.keys())
    const { data: leads } = await supabase
      .from('leads')
      .select('id, phone, raw_metadata')
      .eq('business_id', context.businessId)
      .in('id', leadIds)

    const leadsMap = new Map((leads || []).map((l: any) => [l.id, l]))

    // Analyze each lead for reactivation opportunities
    for (const [leadId, jobs] of jobsByLead.entries()) {
      const lead = leadsMap.get(leadId)
      if (!lead) continue

      const reactivation = await this.analyzeLeadForReactivation(leadId, lead, jobs, context.businessId, supabase)
      if (reactivation) {
        reactivations.push(reactivation)
      }
    }

    // Sort by score (highest first) and take top 5
    const sortedReactivations = reactivations
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, 5)

    this.cache.set(cacheKey, { reactivations: sortedReactivations, timestamp: Date.now() })

    return sortedReactivations
  }

  /**
   * Get reactivation for a specific customer
   */
  async getReactivation(context: CustomerReactivationContext): Promise<CustomerReactivation | null> {
    if (!context.customerId) return null

    const reactivations = await this.getReactivations(context)
    return reactivations.find(r => r.customerId === context.customerId) || null
  }

  /**
   * Invalidate cached reactivations for a business
   */
  invalidateCache(businessId: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.startsWith(businessId)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Analyze a lead for reactivation opportunities
   */
  private async analyzeLeadForReactivation(
    leadId: string,
    lead: any,
    jobs: any[],
    businessId: string,
    supabase: any
  ): Promise<CustomerReactivation | null> {
    if (jobs.length === 0) return null

    const lastJob = jobs[0] // Most recent (sorted descending)
    const lastJobDate = new Date(lastJob.updated_at) // Use updated_at as proxy for completed_at
    const daysSinceLastService = Math.floor((Date.now() - lastJobDate.getTime()) / (1000 * 60 * 60 * 24))

    // Calculate lifetime revenue from payment requests
    const jobIds = jobs.map((j: any) => j.id)
    const { data: payments } = await supabase
      .from('payment_requests')
      .select('job_id, amount_cents')
      .eq('business_id', businessId)
      .in('job_id', jobIds)

    const paymentsByJobId = new Map((payments || []).map((p: any) => [p.job_id, p.amount_cents]))
    // Convert cents to dollars
    const lifetimeRevenue = jobs.reduce((sum: number, j: any) => sum + ((paymentsByJobId.get(j.id) as number | undefined) ?? 0), 0) / 100
    const jobCount = jobs.length

    // Calculate average booking interval using updated_at as proxy
    let averageInterval: number | null = null
    if (jobs.length >= 2) {
      const intervals: number[] = []
      for (let i = 0; i < jobs.length - 1; i++) {
        const current = new Date(jobs[i].updated_at)
        const next = new Date(jobs[i + 1].updated_at)
        const days = Math.floor((current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24))
        intervals.push(days)
      }
      averageInterval = Math.floor(intervals.reduce((a, b) => a + b, 0) / intervals.length)
    }

    // Determine reactivation type
    const type = this.determineReactivationType(jobs, daysSinceLastService, averageInterval, lifetimeRevenue)

    // Determine reason
    const reason = this.determineReason(type, daysSinceLastService, averageInterval, lastJob.title)

    // Calculate score
    const score = this.calculateScore({
      type,
      lifetimeRevenue,
      jobCount,
      daysSinceLastService,
      averageInterval
    })

    // Generate suggested message
    const suggestedMessage = this.generateSuggestedMessage(lead, lastJob, type, averageInterval)

    return {
      id: `reactivation-${leadId}-${Date.now()}`,
      customerId: leadId,
      customerName: this.getCustomerName(lead),
      type,
      score,
      potentialValue: averageInterval ? lifetimeRevenue / jobCount : lifetimeRevenue,
      reason,
      lastServiceDate: lastJob.completed_at,
      daysSinceLastService,
      averageInterval,
      recommendedAction: 'send_message',
      suggestedMessage,
      metadata: {
        lifetimeRevenue,
        jobCount,
        lastJobTitle: lastJob.title,
        inactivePeriod: this.getInactivePeriod(daysSinceLastService)
      }
    }
  }

  /**
   * Determine reactivation type
   */
  private determineReactivationType(
    jobs: any[],
    daysSinceLastService: number,
    averageInterval: number | null,
    lifetimeRevenue: number
  ): ReactivationType {
    // Long inactive
    if (daysSinceLastService >= 365) {
      return 'long_inactive'
    }

    // One-time customer
    if (jobs.length === 1) {
      return 'one_time_customer'
    }

    // High lifetime value
    if (lifetimeRevenue >= 500) {
      return 'high_lifetime_value'
    }

    // Due for service
    if (averageInterval && daysSinceLastService > averageInterval * 1.2) {
      return 'due_for_service'
    }

    // Default to long inactive for 90-180 days
    if (daysSinceLastService >= 90) {
      return 'long_inactive'
    }

    return 'due_for_service'
  }

  /**
   * Determine reason
   */
  private determineReason(
    type: ReactivationType,
    daysSinceLastService: number,
    averageInterval: number | null,
    lastJobTitle?: string
  ): string {
    switch (type) {
      case 'due_for_service':
        return averageInterval
          ? `Normally books every ${averageInterval} days, last job was ${daysSinceLastService} days ago`
          : `Last job was ${daysSinceLastService} days ago`
      case 'seasonal_return':
        return 'Seasonal service approaching'
      case 'high_lifetime_value':
        return `High-value customer (${formatCurrency(500)}+ lifetime revenue), no recent activity`
      case 'one_time_customer':
        return 'Completed one successful job, never contacted again'
      case 'long_inactive':
        const period = this.getInactivePeriod(daysSinceLastService)
        return `No work in ${period} days`
      default:
        return 'Ready for another booking'
    }
  }

  /**
   * Calculate reactivation score (0-100)
   */
  private calculateScore(params: any): any {
    const factors = {
      lifetimeRevenue: 0,
      repeatHistory: 0,
      timeSinceLastService: 0,
      typicalBookingInterval: 0,
      favoriteService: 0,
      businessMemoryConfidence: 0,
      seasonality: 0,
      customerResponsiveness: 0
    }

    // Lifetime revenue (0-20 points)
    factors.lifetimeRevenue = Math.min(20, params.lifetimeRevenue / 50) // $1000 = 20 points

    // Repeat history (0-15 points)
    if (params.jobCount >= 5) {
      factors.repeatHistory = 15
    } else if (params.jobCount >= 3) {
      factors.repeatHistory = 12
    } else if (params.jobCount >= 2) {
      factors.repeatHistory = 8
    } else {
      factors.repeatHistory = 3
    }

    // Time since last service (0-20 points)
    // Sweet spot: 30-90 days is best for reactivation
    const days = params.daysSinceLastService
    if (days >= 30 && days <= 90) {
      factors.timeSinceLastService = 20
    } else if (days >= 90 && days <= 180) {
      factors.timeSinceLastService = 15
    } else if (days >= 180 && days <= 365) {
      factors.timeSinceLastService = 10
    } else if (days < 30) {
      factors.timeSinceLastService = 5
    } else {
      factors.timeSinceLastService = 3
    }

    // Typical booking interval (0-10 points)
    if (params.averageInterval) {
      if (params.averageInterval <= 30) {
        factors.typicalBookingInterval = 10
      } else if (params.averageInterval <= 60) {
        factors.typicalBookingInterval = 8
      } else if (params.averageInterval <= 90) {
        factors.typicalBookingInterval = 5
      } else {
        factors.typicalBookingInterval = 3
      }
    }

    // Favorite service (0-5 points)
    factors.favoriteService = 5

    // Business Memory confidence (0-10 points)
    factors.businessMemoryConfidence = 10

    // Seasonality (0-10 points)
    if (params.type === 'seasonal_return') {
      factors.seasonality = 10
    } else {
      factors.seasonality = 0
    }

    // Customer responsiveness (0-10 points)
    factors.customerResponsiveness = 10

    const totalScore = Object.values(factors).reduce((sum: number, val: number) => sum + val, 0)

    return {
      score: Math.min(100, Math.round(totalScore)),
      factors
    }
  }

  /**
   * Generate suggested message
   */
  private generateSuggestedMessage(
    lead: any,
    lastJob: any,
    type: ReactivationType,
    averageInterval: number | null
  ): any {
    const customerName = this.getCustomerName(lead)
    const serviceName = lastJob?.title || 'service'

    let text = ''

    switch (type) {
      case 'due_for_service':
        text = `Hi ${customerName}!\n\nJust checking in to see if you're ready for another ${serviceName}. Let us know if you'd like to get back on the schedule.`
        break
      case 'one_time_customer':
        text = `Hi ${customerName}!\n\nHope you were happy with your ${serviceName} from last time. We'd love to work with you again - let us know if you need anything!`
        break
      case 'high_lifetime_value':
        text = `Hi ${customerName}!\n\nIt's been a while since we've worked together. We'd love to have you back - let us know if you'd like to schedule something.`
        break
      case 'long_inactive':
        text = `Hi ${customerName}!\n\nHope you're doing well! It's been a while, and we'd love to work with you again. Let us know if you'd like to get back on the schedule.`
        break
      default:
        text = `Hi ${customerName}!\n\nJust checking in to see if you'd like to schedule another service. Let us know!`
    }

    return {
      text,
      isInformational: true
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
   * Get inactive period label
   */
  private getInactivePeriod(days: number): string {
    if (days >= 365) return '365+'
    if (days >= 180) return '180+'
    if (days >= 90) return '90+'
    return `${days}`
  }

  /**
   * Generate cache key from context
   */
  private getCacheKey(context: CustomerReactivationContext): string {
    const parts = [context.businessId]
    if (context.customerId) parts.push(context.customerId)
    return parts.join(':')
  }
}

// Singleton instance
export const customerReactivationService = new CustomerReactivationService()

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}
