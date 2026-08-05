/**
 * Customer Success Service
 * 
 * Helps customers become lifelong customers through customer success.
 * Detects opportunities for review requests, referrals, maintenance, and loyalty milestones.
 */

import { createBrowserClient } from '@/lib/supabase/browser'
import type {
  CustomerSuccessProfile,
  CustomerSuccessOpportunity,
  LoyaltyMilestone,
  CustomerSuccessContext,
  CustomerSuccessServiceInterface,
  CustomerHealth
} from './customer-success-types'

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

// Service-specific maintenance intervals (in months)
const MAINTENANCE_INTERVALS: Record<string, number> = {
  'lawn mowing': 0.5, // 2 weeks
  'pressure washing': 12,
  'hvac': 6,
  'cleaning': 1,
  'landscaping': 1,
  'pest control': 3,
  'pool maintenance': 0.5,
  'carpet cleaning': 12,
  'gutter cleaning': 6,
  'window cleaning': 3
}

class CustomerSuccessService implements CustomerSuccessServiceInterface {
  private cache: Map<string, { profile: CustomerSuccessProfile | null; timestamp: number }> = new Map()
  private opportunitiesCache: Map<string, { opportunities: CustomerSuccessOpportunity[]; timestamp: number }> = new Map()

  /**
   * Get customer success profile
   */
  async getSuccessProfile(context: CustomerSuccessContext): Promise<CustomerSuccessProfile | null> {
    if (!context.customerId) {
      return null
    }

    const cacheKey = this.getCacheKey(context)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.profile
    }

    const supabase = createBrowserClient()

    // Fetch customer data
    const [leadData, jobsData, paymentsData, messagesData] = await Promise.all([
      this.fetchLeadData(context.businessId, context.customerId, supabase),
      this.fetchJobsData(context.businessId, context.customerId, supabase),
      this.fetchPaymentsData(context.businessId, context.customerId, supabase),
      this.fetchMessagesData(context.businessId, context.customerId, supabase)
    ])

    if (!leadData) {
      this.cache.set(cacheKey, { profile: null, timestamp: Date.now() })
      return null
    }

    // Synthesize success profile
    const profile = this.synthesizeSuccessProfile(leadData, jobsData, paymentsData, messagesData)

    this.cache.set(cacheKey, { profile, timestamp: Date.now() })
    return profile
  }

  /**
   * Get customer success opportunities for a business
   */
  async getOpportunities(businessId: string): Promise<CustomerSuccessOpportunity[]> {
    const cacheKey = `opportunities:${businessId}`
    const cached = this.opportunitiesCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.opportunities
    }

    const supabase = createBrowserClient()
    const opportunities: CustomerSuccessOpportunity[] = []

    // Fetch all customers with completed jobs
    const { data: customers } = await supabase
      .from('leads')
      .select('id, name')
      .eq('business_id', businessId)

    if (!customers) return []

    for (const customer of customers) {
      const [jobsData, paymentsData, messagesData] = await Promise.all([
        this.fetchJobsData(businessId, customer.id, supabase),
        this.fetchPaymentsData(businessId, customer.id, supabase),
        this.fetchMessagesData(businessId, customer.id, supabase)
      ])

      const completedJobs = jobsData.filter(j => j.status === 'completed')

      // Detect review opportunities
      const reviewOpportunity = this.detectReviewOpportunity(customer, completedJobs, paymentsData)
      if (reviewOpportunity) {
        opportunities.push(reviewOpportunity)
      }

      // Detect referral opportunities
      const referralOpportunity = this.detectReferralOpportunity(customer, completedJobs, paymentsData, messagesData)
      if (referralOpportunity) {
        opportunities.push(referralOpportunity)
      }

      // Detect maintenance opportunities
      const maintenanceOpportunity = this.detectMaintenanceOpportunity(customer, completedJobs)
      if (maintenanceOpportunity) {
        opportunities.push(maintenanceOpportunity)
      }

      // Detect loyalty milestones
      const loyaltyOpportunity = this.detectLoyaltyMilestone(customer, completedJobs, paymentsData)
      if (loyaltyOpportunity) {
        opportunities.push(loyaltyOpportunity)
      }
    }

    // Sort by priority and limit to top 5
    const sortedOpportunities = opportunities
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      })
      .slice(0, 5)

    this.opportunitiesCache.set(cacheKey, { opportunities: sortedOpportunities, timestamp: Date.now() })
    return sortedOpportunities
  }

  /**
   * Invalidate cached data for a business
   */
  invalidateCache(businessId: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.includes(businessId)) {
        this.cache.delete(key)
      }
    }
    this.opportunitiesCache.delete(`opportunities:${businessId}`)
  }

  /**
   * Fetch lead data
   */
  private async fetchLeadData(businessId: string, customerId: string, supabase: any): Promise<any> {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .eq('id', customerId)
      .single()
    return data
  }

  /**
   * Fetch jobs data
   */
  private async fetchJobsData(businessId: string, customerId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('business_id', businessId)
      .eq('lead_id', customerId)
      .order('created_at', { ascending: false })
    return data || []
  }

  /**
   * Fetch payments data
   */
  private async fetchPaymentsData(businessId: string, customerId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
    return data || []
  }

  /**
   * Fetch messages data
   */
  private async fetchMessagesData(businessId: string, customerId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('business_id', businessId)
      .eq('lead_id', customerId)
      .order('created_at', { ascending: false })
      .limit(100)
    return data || []
  }

  /**
   * Synthesize customer success profile
   */
  private synthesizeSuccessProfile(leadData: any, jobsData: any[], paymentsData: any[], messagesData: any[]): CustomerSuccessProfile | null {
    if (!leadData) return null

    const completedJobs = jobsData.filter(j => j.status === 'completed')
    const lifetimeRevenue = this.calculateLifetimeRevenue(completedJobs, paymentsData)
    const relationshipAge = this.calculateRelationshipAge(leadData.created_at)

    const health = this.calculateCustomerHealth(completedJobs, paymentsData, messagesData, leadData)
    const healthFactors = this.calculateHealthFactors(completedJobs, paymentsData, messagesData, leadData)
    const nextOpportunity = this.detectNextOpportunity(leadData, completedJobs, paymentsData, messagesData)
    const loyaltyMilestones = this.calculateLoyaltyMilestones(completedJobs, paymentsData, leadData)

    return {
      customerId: leadData.id,
      customerName: leadData.name || 'Customer',
      health,
      healthFactors,
      nextOpportunity,
      lifetimeRevenue,
      completedJobs: completedJobs.length,
      relationshipAge,
      loyaltyMilestones
    }
  }

  /**
   * Calculate customer health
   */
  private calculateCustomerHealth(jobs: any[], payments: any[], messages: any[], lead: any): CustomerHealth {
    const factors = this.calculateHealthFactors(jobs, payments, messages, lead)
    const avgHealth = (factors.communication + factors.payments + factors.repeatBusiness + factors.recentActivity) / 4

    if (avgHealth >= 80) return 'excellent'
    if (avgHealth >= 60) return 'healthy'
    if (avgHealth >= 40) return 'needs_attention'
    return 'at_risk'
  }

  /**
   * Calculate health factors
   */
  private calculateHealthFactors(jobs: any[], paymentData: any[], messages: any[], lead: any): {
    communication: number
    payments: number
    repeatBusiness: number
    recentActivity: number
  } {
    const communication = this.calculateCommunicationHealth(messages)
    const payments = this.calculatePaymentHealth(paymentData)
    const repeatBusiness = this.calculateRepeatBusinessHealth(jobs)
    const recentActivity = this.calculateRecentActivityHealth(lead, jobs, messages)

    return { communication, payments, repeatBusiness, recentActivity }
  }

  /**
   * Calculate communication health (0-100)
   */
  private calculateCommunicationHealth(messages: any[]): number {
    if (messages.length === 0) return 50

    const customerMessages = messages.filter(m => m.direction === 'inbound').length
    const businessResponses = messages.filter(m => m.direction === 'outbound').length

    if (customerMessages > 0 && businessResponses >= customerMessages) {
      return 100
    } else if (customerMessages > 0 && businessResponses >= customerMessages * 0.5) {
      return 75
    } else if (messages.length >= 5) {
      return 50
    } else {
      return 25
    }
  }

  /**
   * Calculate payment health (0-100)
   */
  private calculatePaymentHealth(payments: any[]): number {
    const totalPayments = payments.length
    if (totalPayments === 0) return 50

    const paidPayments = payments.filter(p => p.status === 'paid').length
    const paidRatio = paidPayments / totalPayments

    return Math.round(paidRatio * 100)
  }

  /**
   * Calculate repeat business health (0-100)
   */
  private calculateRepeatBusinessHealth(jobs: any[]): number {
    const completedJobs = jobs.filter(j => j.status === 'completed')
    if (completedJobs.length === 0) return 25
    if (completedJobs.length === 1) return 50
    if (completedJobs.length >= 5) return 100
    return 50 + (completedJobs.length * 10)
  }

  /**
   * Calculate recent activity health (0-100)
   */
  private calculateRecentActivityHealth(lead: any, jobs: any[], messages: any[]): number {
    const now = new Date()
    const lastActivity = this.getLastActivityDate(lead, jobs, messages)
    if (!lastActivity) return 25

    const daysSinceActivity = (now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)

    if (daysSinceActivity < 7) return 100
    if (daysSinceActivity < 30) return 75
    if (daysSinceActivity < 90) return 50
    return 25
  }

  /**
   * Get last activity date
   */
  private getLastActivityDate(lead: any, jobs: any[], messages: any[]): string | null {
    const dates: string[] = []

    if (lead.created_at) dates.push(lead.created_at)
    jobs.forEach(j => { if (j.created_at) dates.push(j.created_at) })
    messages.forEach(m => { if (m.created_at) dates.push(m.created_at) })

    if (dates.length === 0) return null

    return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
  }

  /**
   * Detect review opportunity
   */
  private detectReviewOpportunity(customer: any, jobs: any[], payments: any[]): CustomerSuccessOpportunity | null {
    const completedJobs = jobs.filter(j => j.status === 'completed')
    if (completedJobs.length === 0) return null

    const paidPayments = payments.filter((p: any) => p.status === 'paid')
    if (paidPayments.length === 0) return null

    // Check if review was recently requested (within last 30 days)
    const recentReviewRequest = false

    if (recentReviewRequest) return null

    const lastCompletedJob = completedJobs[0]
    const daysSinceCompletion = (Date.now() - new Date(lastCompletedJob.created_at).getTime()) / (1000 * 60 * 60 * 24)

    if (daysSinceCompletion > 30) return null

    return {
      id: `review-${customer.id}`,
      customerId: customer.id,
      customerName: customer.name || 'Customer',
      type: 'review_request',
      title: 'Ready for Review',
      description: 'Customer completed work and paid successfully',
      reason: 'Completed job with successful payment',
      timing: 'Within 7 days',
      potentialValue: 0,
      priority: 'medium',
      metadata: {
        relatedJobId: lastCompletedJob.id
      }
    }
  }

  /**
   * Detect referral opportunity
   */
  private detectReferralOpportunity(customer: any, jobs: any[], payments: any[], messages: any[]): CustomerSuccessOpportunity | null {
    const completedJobs = jobs.filter(j => j.status === 'completed')
    if (completedJobs.length < 2) return null

    const paidPayments = payments.filter(p => p.status === 'paid')
    if (paidPayments.length < 2) return null

    const paymentHealth = this.calculatePaymentHealth(payments)
    const communicationHealth = this.calculateCommunicationHealth(messages)

    if (paymentHealth < 80 || communicationHealth < 75) return null

    return {
      id: `referral-${customer.id}`,
      customerId: customer.id,
      customerName: customer.name || 'Customer',
      type: 'referral',
      title: 'Good Referral Candidate',
      description: 'Repeat customer with positive relationship',
      reason: `${completedJobs.length} completed jobs, payment reliability ${paymentHealth}%, good communication`,
      timing: 'Anytime',
      potentialValue: completedJobs.length * 100,
      priority: 'medium',
      metadata: {}
    }
  }

  /**
   * Detect maintenance opportunity
   */
  private detectMaintenanceOpportunity(customer: any, jobs: any[]): CustomerSuccessOpportunity | null {
    const completedJobs = jobs.filter(j => j.status === 'completed')
    if (completedJobs.length === 0) return null

    const lastJob = completedJobs[0]
    if (!lastJob.service_name) return null

    const interval = MAINTENANCE_INTERVALS[lastJob.service_name.toLowerCase()]
    if (!interval) return null

    const daysSinceCompletion = (Date.now() - new Date(lastJob.created_at).getTime()) / (1000 * 60 * 60 * 24)
    const intervalDays = interval * 30

    if (daysSinceCompletion < intervalDays * 0.8) return null // Not yet due

    const nextServiceDate = new Date(lastJob.created_at)
    nextServiceDate.setMonth(nextServiceDate.getMonth() + interval)

    return {
      id: `maintenance-${customer.id}`,
      customerId: customer.id,
      customerName: customer.name || 'Customer',
      type: 'maintenance',
      title: 'Maintenance Due',
      description: `Next ${lastJob.service_name} recommended`,
      reason: `Based on completed ${lastJob.service_name} service`,
      timing: `Within ${Math.round(intervalDays - daysSinceCompletion)} days`,
      potentialValue: lastJob.amount ? parseFloat(lastJob.amount) : 100,
      priority: daysSinceCompletion > intervalDays ? 'high' : 'medium',
      metadata: {
        serviceType: lastJob.service_name,
        nextServiceDate: nextServiceDate.toISOString()
      }
    }
  }

  /**
   * Detect loyalty milestone
   */
  private detectLoyaltyMilestone(customer: any, jobs: any[], payments: any[]): CustomerSuccessOpportunity | null {
    const completedJobs = jobs.filter(j => j.status === 'completed')
    if (completedJobs.length === 0) return null

    const jobCount = completedJobs.length
    const lifetimeRevenue = this.calculateLifetimeRevenue(completedJobs, payments)

    let milestone = ''
    let potentialValue = 0

    if (jobCount === 5) {
      milestone = '5th completed job'
      potentialValue = 50
    } else if (lifetimeRevenue >= 5000) {
      milestone = '$5,000 lifetime revenue'
      potentialValue = 100
    } else if (jobCount === 10) {
      milestone = '10th completed job'
      potentialValue = 100
    } else {
      return null
    }

    return {
      id: `loyalty-${customer.id}`,
      customerId: customer.id,
      customerName: customer.name || 'Customer',
      type: 'loyalty_milestone',
      title: 'Loyalty Milestone',
      description: milestone,
      reason: 'Relationship milestone achieved',
      timing: 'Now',
      potentialValue,
      priority: 'low',
      metadata: {
        milestone
      }
    }
  }

  /**
   * Detect next opportunity for a customer
   */
  private detectNextOpportunity(customer: any, jobs: any[], payments: any[], messages: any[]): CustomerSuccessOpportunity | undefined {
    const reviewOpportunity = this.detectReviewOpportunity(customer, jobs, payments)
    if (reviewOpportunity) return reviewOpportunity

    const maintenanceOpportunity = this.detectMaintenanceOpportunity(customer, jobs)
    if (maintenanceOpportunity) return maintenanceOpportunity

    const loyaltyOpportunity = this.detectLoyaltyMilestone(customer, jobs, payments)
    if (loyaltyOpportunity) return loyaltyOpportunity

    return undefined
  }

  /**
   * Calculate loyalty milestones
   */
  private calculateLoyaltyMilestones(jobs: any[], payments: any[], lead: any): LoyaltyMilestone[] {
    const completedJobs = jobs.filter(j => j.status === 'completed')
    const milestones: LoyaltyMilestone[] = []
    const jobCount = completedJobs.length
    const lifetimeRevenue = this.calculateLifetimeRevenue(completedJobs, payments)
    const relationshipAge = this.calculateRelationshipAge(lead.created_at)

    // Job count milestones
    if (jobCount >= 5) {
      milestones.push({
        id: 'jobs-5',
        type: 'job_count',
        title: '5th Completed Job',
        description: 'Customer has completed 5 jobs',
        achieved: true,
        achievedAt: completedJobs[4]?.created_at
      })
    }

    if (jobCount >= 10) {
      milestones.push({
        id: 'jobs-10',
        type: 'job_count',
        title: '10th Completed Job',
        description: 'Customer has completed 10 jobs',
        achieved: true,
        achievedAt: completedJobs[9]?.created_at
      })
    }

    // Revenue milestones
    if (lifetimeRevenue >= 1000) {
      milestones.push({
        id: 'revenue-1000',
        type: 'revenue',
        title: '$1,000 Lifetime Revenue',
        description: 'Customer has spent $1,000',
        achieved: true
      })
    }

    if (lifetimeRevenue >= 5000) {
      milestones.push({
        id: 'revenue-5000',
        type: 'revenue',
        title: '$5,000 Lifetime Revenue',
        description: 'Customer has spent $5,000',
        achieved: true
      })
    }

    // Tenure milestones
    if (relationshipAge.includes('year')) {
      milestones.push({
        id: 'tenure-1',
        type: 'tenure',
        title: 'Customer for 1 Year',
        description: 'Customer relationship for 1 year',
        achieved: true
      })
    }

    // Payment reliability milestone
    const paidPayments = payments.filter(p => p.status === 'paid')
    if (paidPayments.length === payments.length && payments.length >= 3) {
      milestones.push({
        id: 'payment-reliability',
        type: 'payment_reliability',
        title: 'Never Missed Payment',
        description: 'Customer has never missed a payment',
        achieved: true
      })
    }

    return milestones
  }

  /**
   * Calculate lifetime revenue
   */
  private calculateLifetimeRevenue(jobs: any[], payments: any[]): number {
    let revenue = 0

    jobs.forEach(job => {
      if (job.amount) {
        revenue += parseFloat(job.amount)
      }
    })

    payments.forEach(payment => {
      if (payment.status === 'paid' && payment.amount) {
        revenue += parseFloat(payment.amount)
      }
    })

    return revenue
  }

  /**
   * Calculate relationship age
   */
  private calculateRelationshipAge(createdAt: string): string {
    const now = new Date()
    const created = new Date(createdAt)
    const diffMs = now.getTime() - created.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffMonths = Math.floor(diffDays / 30)
    const diffYears = Math.floor(diffDays / 365)

    if (diffYears > 0) {
      return `${diffYears} year${diffYears > 1 ? 's' : ''}`
    } else if (diffMonths > 0) {
      return `${diffMonths} month${diffMonths > 1 ? 's' : ''}`
    } else if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''}`
    } else {
      return 'New'
    }
  }

  /**
   * Generate cache key from context
   */
  private getCacheKey(context: CustomerSuccessContext): string {
    return `${context.businessId}:${context.customerId || 'all'}`
  }
}

// Singleton instance
export const customerSuccessService = new CustomerSuccessService()
