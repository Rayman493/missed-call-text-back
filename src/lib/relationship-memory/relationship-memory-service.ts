/**
 * Relationship Memory Service
 * 
 * Fetches and synthesizes Business Memory data into a concise customer profile.
 * No raw database fields - only learned business knowledge.
 */

import { createBrowserClient } from '@/lib/supabase/browser'
import type {
  RelationshipProfile,
  RelationshipContext,
  RelationshipServiceInterface
} from './relationship-memory-types'

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

class RelationshipService implements RelationshipServiceInterface {
  private cache: Map<string, { profile: RelationshipProfile | null; timestamp: number }> = new Map()

  /**
   * Get relationship profile for a customer
   */
  async getRelationshipProfile(context: RelationshipContext): Promise<RelationshipProfile | null> {
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

    // Synthesize relationship profile
    const profile = this.synthesizeProfile(leadData, jobsData, paymentsData, messagesData)

    this.cache.set(cacheKey, { profile, timestamp: Date.now() })
    return profile
  }

  /**
   * Invalidate cached profiles for a business
   */
  invalidateCache(businessId: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.includes(businessId)) {
        this.cache.delete(key)
      }
    }
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
   * Synthesize relationship profile from raw data
   */
  private synthesizeProfile(leadData: any, jobsData: any[], paymentsData: any[], messagesData: any[]): RelationshipProfile | null {
    if (!leadData) return null

    const completedJobs = jobsData.filter(j => j.status === 'completed')
    const lifetimeRevenue = this.calculateLifetimeRevenue(completedJobs, paymentsData)
    const relationshipAge = this.calculateRelationshipAge(leadData.created_at)
    const favoriteService = this.determineFavoriteService(completedJobs)
    const preferredAppointmentTime = this.determinePreferredAppointmentTime(jobsData)
    const preferredCommunicationMethod = this.determinePreferredCommunicationMethod(messagesData)
    const averageResponseTime = this.calculateAverageResponseTime(messagesData)
    const averagePaymentSpeed = this.calculateAveragePaymentSpeed(paymentsData)
    const typicalBookingInterval = this.calculateTypicalBookingInterval(jobsData)
    const customerValue = this.determineCustomerValue(lifetimeRevenue, completedJobs.length)
    const repeatCustomerStatus = this.determineRepeatCustomerStatus(jobsData.length)
    const trustLevel = this.determineTrustLevel(completedJobs.length, paymentsData)
    const communicationHealth = this.determineCommunicationHealth(messagesData)
    const paymentReliability = this.determinePaymentReliability(paymentsData)
    const nextLikelyService = this.predictNextLikelyService(completedJobs, favoriteService)

    return {
      customerId: leadData.id,
      customerName: leadData.name || 'Customer',
      relationshipAge,
      lifetimeRevenue,
      completedJobs: completedJobs.length,
      favoriteService,
      preferredAppointmentTime,
      preferredCommunicationMethod,
      averageResponseTime,
      averagePaymentSpeed,
      typicalBookingInterval,
      customerValue,
      repeatCustomerStatus,
      trustLevel,
      communicationHealth,
      paymentReliability,
      nextLikelyService
    }
  }

  /**
   * Calculate lifetime revenue
   */
  private calculateLifetimeRevenue(jobs: any[], payments: any[]): number {
    let revenue = 0
    
    // Add revenue from completed jobs
    jobs.forEach(job => {
      if (job.amount) {
        revenue += parseFloat(job.amount)
      }
    })
    
    // Add revenue from paid payments
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
   * Determine favorite service
   */
  private determineFavoriteService(jobs: any[]): string | undefined {
    if (jobs.length === 0) return undefined

    const serviceCounts: Record<string, number> = {}
    jobs.forEach(job => {
      if (job.service_name) {
        serviceCounts[job.service_name] = (serviceCounts[job.service_name] || 0) + 1
      }
    })

    let maxCount = 0
    let favoriteService: string | undefined

    Object.entries(serviceCounts).forEach(([service, count]) => {
      if (count > maxCount) {
        maxCount = count
        favoriteService = service
      }
    })

    return favoriteService
  }

  /**
   * Determine preferred appointment time
   */
  private determinePreferredAppointmentTime(jobs: any[]): string | undefined {
    const scheduledJobs = jobs.filter(j => j.scheduled_date)
    if (scheduledJobs.length === 0) return undefined

    const hours: Record<string, number> = {}
    scheduledJobs.forEach(job => {
      const hour = new Date(job.scheduled_date).getHours()
      const timeSlot = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
      hours[timeSlot] = (hours[timeSlot] || 0) + 1
    })

    let maxCount = 0
    let preferredTime: string | undefined

    Object.entries(hours).forEach(([time, count]) => {
      if (count > maxCount) {
        maxCount = count
        preferredTime = time
      }
    })

    return preferredTime
  }

  /**
   * Determine preferred communication method
   */
  private determinePreferredCommunicationMethod(messages: any[]): string | undefined {
    if (messages.length === 0) return undefined

    // Count message types (SMS vs other)
    const smsCount = messages.filter(m => m.direction === 'outbound' && m.type === 'sms').length
    const totalCount = messages.length

    if (smsCount > totalCount * 0.7) {
      return 'SMS'
    } else {
      return 'Mixed'
    }
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(messages: any[]): string | undefined {
    if (messages.length < 2) return undefined

    let totalResponseTime = 0
    let responseCount = 0

    // Calculate time between customer messages and business responses
    for (let i = 0; i < messages.length - 1; i++) {
      const current = messages[i]
      const next = messages[i + 1]

      if (current.direction === 'inbound' && next.direction === 'outbound') {
        const diffMs = new Date(next.created_at).getTime() - new Date(current.created_at).getTime()
        totalResponseTime += diffMs
        responseCount++
      }
    }

    if (responseCount === 0) return undefined

    const avgMs = totalResponseTime / responseCount
    const avgHours = avgMs / (1000 * 60 * 60)

    if (avgHours < 1) {
      return 'Less than 1 hour'
    } else if (avgHours < 24) {
      return `${Math.round(avgHours)} hours`
    } else {
      return `${Math.round(avgHours / 24)} days`
    }
  }

  /**
   * Calculate average payment speed
   */
  private calculateAveragePaymentSpeed(payments: any[]): string | undefined {
    const paidPayments = payments.filter(p => p.status === 'paid')
    if (paidPayments.length === 0) return undefined

    let totalSpeed = 0
    paidPayments.forEach(payment => {
      if (payment.created_at && payment.updated_at) {
        const diffMs = new Date(payment.updated_at).getTime() - new Date(payment.created_at).getTime()
        totalSpeed += diffMs
      }
    })

    const avgMs = totalSpeed / paidPayments.length
    const avgDays = avgMs / (1000 * 60 * 60 * 24)

    if (avgDays < 1) {
      return 'Immediate'
    } else if (avgDays < 2) {
      return 'Within 1 day'
    } else if (avgDays < 7) {
      return `${Math.round(avgDays)} days`
    } else {
      return `${Math.round(avgDays / 7)} weeks`
    }
  }

  /**
   * Calculate typical booking interval
   */
  private calculateTypicalBookingInterval(jobs: any[]): string | undefined {
    const completedJobs = jobs.filter(j => j.status === 'completed')
    if (completedJobs.length < 2) return undefined

    const intervals: number[] = []
    for (let i = 0; i < completedJobs.length - 1; i++) {
      const current = completedJobs[i]
      const next = completedJobs[i + 1]
      const diffMs = new Date(current.created_at).getTime() - new Date(next.created_at).getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      intervals.push(diffDays)
    }

    const avgDays = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const avgMonths = avgDays / 30

    if (avgMonths < 1) {
      return `${Math.round(avgDays)} days`
    } else if (avgMonths < 6) {
      return `${Math.round(avgMonths)} months`
    } else {
      return `${Math.round(avgMonths / 12)} years`
    }
  }

  /**
   * Determine customer value
   */
  private determineCustomerValue(lifetimeRevenue: number, jobCount: number): 'high' | 'medium' | 'low' {
    if (lifetimeRevenue >= 500 || jobCount >= 5) {
      return 'high'
    } else if (lifetimeRevenue >= 100 || jobCount >= 2) {
      return 'medium'
    } else {
      return 'low'
    }
  }

  /**
   * Determine repeat customer status
   */
  private determineRepeatCustomerStatus(jobCount: number): 'repeat' | 'one-time' | 'new' {
    if (jobCount === 0) {
      return 'new'
    } else if (jobCount >= 2) {
      return 'repeat'
    } else {
      return 'one-time'
    }
  }

  /**
   * Determine trust level
   */
  private determineTrustLevel(jobCount: number, payments: any[]): 'high' | 'medium' | 'low' {
    const paidPayments = payments.filter(p => p.status === 'paid').length
    const totalPayments = payments.length

    if (jobCount >= 3 && paidPayments === totalPayments) {
      return 'high'
    } else if (jobCount >= 1) {
      return 'medium'
    } else {
      return 'low'
    }
  }

  /**
   * Determine communication health
   */
  private determineCommunicationHealth(messages: any[]): 'excellent' | 'good' | 'fair' | 'poor' {
    if (messages.length === 0) return 'poor'

    const customerMessages = messages.filter(m => m.direction === 'inbound').length
    const businessResponses = messages.filter(m => m.direction === 'outbound').length

    if (customerMessages > 0 && businessResponses >= customerMessages) {
      return 'excellent'
    } else if (customerMessages > 0 && businessResponses >= customerMessages * 0.5) {
      return 'good'
    } else if (messages.length >= 5) {
      return 'fair'
    } else {
      return 'poor'
    }
  }

  /**
   * Determine payment reliability
   */
  private determinePaymentReliability(payments: any[]): 'excellent' | 'good' | 'fair' | 'poor' {
    const totalPayments = payments.length
    if (totalPayments === 0) return 'poor'

    const paidPayments = payments.filter(p => p.status === 'paid').length
    const paidRatio = paidPayments / totalPayments

    if (paidRatio === 1) {
      return 'excellent'
    } else if (paidRatio >= 0.8) {
      return 'good'
    } else if (paidRatio >= 0.5) {
      return 'fair'
    } else {
      return 'poor'
    }
  }

  /**
   * Predict next likely service
   */
  private predictNextLikelyService(jobs: any[], favoriteService?: string): string | undefined {
    return favoriteService
  }

  /**
   * Generate cache key from context
   */
  private getCacheKey(context: RelationshipContext): string {
    return `${context.businessId}:${context.customerId}`
  }
}

// Singleton instance
export const relationshipService = new RelationshipService()
