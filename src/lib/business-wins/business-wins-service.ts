/**
 * Business Wins Service
 * 
 * Detects and tracks meaningful business milestones.
 * Not gamification - quiet recognition of real business progress.
 */

import { createBrowserClient } from '@/lib/supabase/browser'
import type {
  BusinessWin,
  CustomerMilestone,
  BusinessWinsContext,
  BusinessWinsServiceInterface
} from './business-wins-types'

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const WIN_RETENTION_DAYS = 30 // Wins older than 30 days are hidden

class BusinessWinsService implements BusinessWinsServiceInterface {
  private cache: Map<string, { wins: BusinessWin[]; timestamp: number }> = new Map()
  private milestoneCache: Map<string, { milestone: CustomerMilestone | null; timestamp: number }> = new Map()

  /**
   * Get recent wins for a business
   */
  async getRecentWins(context: BusinessWinsContext): Promise<BusinessWin[]> {
    const cacheKey = `wins:${context.businessId}`
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.wins
    }

    const supabase = createBrowserClient()
    const wins: BusinessWin[] = []

    // Fetch business data for win detection
    const [leadsData, jobsData, paymentsData] = await Promise.all([
      this.fetchLeadsData(context.businessId, supabase),
      this.fetchJobsData(context.businessId, supabase),
      this.fetchPaymentsData(context.businessId, supabase)
    ])

    // Detect customer wins
    const customerWins = this.detectCustomerWins(leadsData, jobsData, paymentsData)
    wins.push(...customerWins)

    // Detect revenue wins
    const revenueWins = this.detectRevenueWins(paymentsData, jobsData)
    wins.push(...revenueWins)

    // Detect operations wins
    const operationsWins = this.detectOperationsWins(jobsData, paymentsData)
    wins.push(...operationsWins)

    // Detect relationship wins
    const relationshipWins = this.detectRelationshipWins(leadsData, jobsData)
    wins.push(...relationshipWins)

    // Detect growth wins
    const growthWins = this.detectGrowthWins(jobsData, paymentsData)
    wins.push(...growthWins)

    // Filter to wins from last 30 days and sort by date
    const thirtyDaysAgo = new Date(Date.now() - WIN_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const recentWins = wins
      .filter(win => new Date(win.achievedAt) > thirtyDaysAgo)
      .sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
      .slice(0, 3)

    this.cache.set(cacheKey, { wins: recentWins, timestamp: Date.now() })
    return recentWins
  }

  /**
   * Get customer milestone for a specific customer
   */
  async getCustomerMilestone(context: BusinessWinsContext): Promise<CustomerMilestone | null> {
    if (!context.customerId) {
      return null
    }

    const cacheKey = `milestone:${context.businessId}:${context.customerId}`
    const cached = this.milestoneCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.milestone
    }

    const supabase = createBrowserClient()

    const [leadData, jobsData, paymentsData] = await Promise.all([
      this.fetchLeadData(context.businessId, context.customerId, supabase),
      this.fetchCustomerJobsData(context.businessId, context.customerId, supabase),
      this.fetchCustomerPaymentsData(context.businessId, context.customerId, supabase)
    ])

    if (!leadData) {
      this.milestoneCache.set(cacheKey, { milestone: null, timestamp: Date.now() })
      return null
    }

    const milestone = this.detectCustomerMilestone(leadData, jobsData, paymentsData)
    this.milestoneCache.set(cacheKey, { milestone, timestamp: Date.now() })
    return milestone
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
    for (const [key] of this.milestoneCache.entries()) {
      if (key.includes(businessId)) {
        this.milestoneCache.delete(key)
      }
    }
  }

  /**
   * Fetch leads data
   */
  private async fetchLeadsData(businessId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    return data || []
  }

  /**
   * Fetch jobs data
   */
  private async fetchJobsData(businessId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    return data || []
  }

  /**
   * Fetch payments data
   */
  private async fetchPaymentsData(businessId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    return data || []
  }

  /**
   * Fetch single lead data
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
   * Fetch customer jobs data
   */
  private async fetchCustomerJobsData(businessId: string, customerId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('business_id', businessId)
      .eq('lead_id', customerId)
      .order('created_at', { ascending: false })
    return data || []
  }

  /**
   * Fetch customer payments data
   */
  private async fetchCustomerPaymentsData(businessId: string, customerId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
    return data || []
  }

  /**
   * Detect customer wins
   */
  private detectCustomerWins(leads: any[], jobs: any[], payments: any[]): BusinessWin[] {
    const wins: BusinessWin[] = []
    const paidPayments = payments.filter(p => p.status === 'paid')
    const completedJobs = jobs.filter(j => j.status === 'completed')

    // First paying customer
    if (paidPayments.length === 1) {
      const firstPayment = paidPayments[0]
      wins.push({
        id: `first-paying-customer-${firstPayment.id}`,
        category: 'customer',
        title: 'First Paying Customer',
        description: 'Your first customer has made a payment',
        achievedAt: firstPayment.created_at,
        customerId: firstPayment.customer_id,
        customerName: leads.find(l => l.id === firstPayment.customer_id)?.name,
        metadata: {}
      })
    }

    // First repeat customer
    const customerJobCounts: Record<string, number> = {}
    completedJobs.forEach(job => {
      if (job.lead_id) {
        customerJobCounts[job.lead_id] = (customerJobCounts[job.lead_id] || 0) + 1
      }
    })

    const firstRepeatCustomer = Object.entries(customerJobCounts).find(([_, count]) => count === 2)
    if (firstRepeatCustomer) {
      const [customerId] = firstRepeatCustomer
      const customerJobs = completedJobs.filter(j => j.lead_id === customerId)
      const secondJob = customerJobs[1]
      wins.push({
        id: `first-repeat-customer-${customerId}`,
        category: 'customer',
        title: 'First Repeat Customer',
        description: 'Your first customer has returned for a second job',
        achievedAt: secondJob.created_at,
        customerId,
        customerName: leads.find(l => l.id === customerId)?.name,
        metadata: {}
      })
    }

    // 10th customer
    if (paidPayments.length === 10) {
      const tenthPayment = paidPayments[0]
      wins.push({
        id: `10th-customer-${tenthPayment.id}`,
        category: 'customer',
        title: '10th Customer',
        description: 'You now have 10 paying customers',
        achievedAt: tenthPayment.created_at,
        customerId: tenthPayment.customer_id,
        customerName: leads.find(l => l.id === tenthPayment.customer_id)?.name,
        metadata: {}
      })
    }

    // 100th customer
    if (paidPayments.length === 100) {
      const hundredthPayment = paidPayments[0]
      wins.push({
        id: `100th-customer-${hundredthPayment.id}`,
        category: 'customer',
        title: '100th Customer',
        description: 'You now have 100 paying customers',
        achievedAt: hundredthPayment.created_at,
        customerId: hundredthPayment.customer_id,
        customerName: leads.find(l => l.id === hundredthPayment.customer_id)?.name,
        metadata: {}
      })
    }

    // Highest lifetime value customer
    const customerRevenue: Record<string, number> = {}
    paidPayments.forEach(payment => {
      if (payment.customer_id && payment.amount) {
        customerRevenue[payment.customer_id] = (customerRevenue[payment.customer_id] || 0) + parseFloat(payment.amount)
      }
    })

    completedJobs.forEach(job => {
      if (job.lead_id && job.amount) {
        customerRevenue[job.lead_id] = (customerRevenue[job.lead_id] || 0) + parseFloat(job.amount)
      }
    })

    const maxRevenueCustomer = Object.entries(customerRevenue).reduce((max, [customerId, revenue]) => {
      return revenue > max.revenue ? { customerId, revenue } : max
    }, { customerId: '', revenue: 0 })

    if (maxRevenueCustomer.customerId && maxRevenueCustomer.revenue > 0) {
      const customerPayments = paidPayments.filter(p => p.customer_id === maxRevenueCustomer.customerId)
      const lastPayment = customerPayments[0]
      wins.push({
        id: `highest-ltv-customer-${maxRevenueCustomer.customerId}`,
        category: 'customer',
        title: 'Highest Lifetime Value Customer',
        description: `Your highest-value customer at ${formatCurrency(maxRevenueCustomer.revenue)}`,
        achievedAt: lastPayment?.created_at || new Date().toISOString(),
        customerId: maxRevenueCustomer.customerId,
        customerName: leads.find(l => l.id === maxRevenueCustomer.customerId)?.name,
        metadata: { value: maxRevenueCustomer.revenue }
      })
    }

    return wins.sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
  }

  /**
   * Detect revenue wins
   */
  private detectRevenueWins(payments: any[], jobs: any[]): BusinessWin[] {
    const wins: BusinessWin[] = []
    const paidPayments = payments.filter(p => p.status === 'paid')
    const completedJobs = jobs.filter(j => j.status === 'completed')

    // Calculate total revenue
    let totalRevenue = 0
    paidPayments.forEach(p => {
      if (p.amount) totalRevenue += parseFloat(p.amount)
    })
    completedJobs.forEach(j => {
      if (j.amount) totalRevenue += parseFloat(j.amount)
    })

    // First $1,000 collected
    if (totalRevenue >= 1000 && totalRevenue < 1500) {
      const latestPayment = paidPayments[0] || completedJobs[0]
      wins.push({
        id: `first-1000-${Date.now()}`,
        category: 'revenue',
        title: 'First $1,000 Collected',
        description: 'You have collected your first $1,000 in revenue',
        achievedAt: latestPayment?.created_at || new Date().toISOString(),
        metadata: { value: 1000 }
      })
    }

    // $10,000 collected
    if (totalRevenue >= 10000 && totalRevenue < 10500) {
      const latestPayment = paidPayments[0] || completedJobs[0]
      wins.push({
        id: `10000-${Date.now()}`,
        category: 'revenue',
        title: '$10,000 Collected',
        description: 'You have collected $10,000 in total revenue',
        achievedAt: latestPayment?.created_at || new Date().toISOString(),
        metadata: { value: 10000 }
      })
    }

    // Largest single payment
    const largestPayment = paidPayments.reduce((max, p) => {
      const amount = p.amount ? parseFloat(p.amount) : 0
      return amount > max.amount ? { payment: p, amount } : max
    }, { payment: null, amount: 0 })

    if (largestPayment.payment && largestPayment.amount > 500) {
      wins.push({
        id: `largest-payment-${largestPayment.payment.id}`,
        category: 'revenue',
        title: 'Largest Single Payment',
        description: `Your largest payment of ${formatCurrency(largestPayment.amount)}`,
        achievedAt: largestPayment.payment.created_at,
        customerId: largestPayment.payment.customer_id,
        metadata: { value: largestPayment.amount }
      })
    }

    return wins.sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
  }

  /**
   * Detect operations wins
   */
  private detectOperationsWins(jobs: any[], payments: any[]): BusinessWin[] {
    const wins: BusinessWin[] = []
    const completedJobs = jobs.filter(j => j.status === 'completed')
    const paidPayments = payments.filter(p => p.status === 'paid')

    // All payments collected this week
    const thisWeekPayments = paidPayments.filter(p => {
      const paymentDate = new Date(p.created_at)
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return paymentDate > weekAgo
    })

    const thisWeekUnpaid = payments.filter(p => {
      const paymentDate = new Date(p.created_at)
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return paymentDate > weekAgo && p.status !== 'paid'
    })

    if (thisWeekPayments.length >= 3 && thisWeekUnpaid.length === 0) {
      const latestPayment = thisWeekPayments[0]
      wins.push({
        id: `all-paid-week-${Date.now()}`,
        category: 'operations',
        title: 'All Payments Collected This Week',
        description: 'Every payment from this week has been collected',
        achievedAt: latestPayment.created_at,
        metadata: {}
      })
    }

    return wins.sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
  }

  /**
   * Detect relationship wins
   */
  private detectRelationshipWins(leads: any[], jobs: any[]): BusinessWin[] {
    const wins: BusinessWin[] = []
    const completedJobs = jobs.filter(j => j.status === 'completed')

    // Customer returned after 1 year
    const now = new Date()
    leads.forEach(lead => {
      const customerJobs = completedJobs.filter(j => j.lead_id === lead.id)
      if (customerJobs.length >= 2) {
        const firstJob = customerJobs[customerJobs.length - 1]
        const lastJob = customerJobs[0]
        const yearsBetween = (new Date(lastJob.created_at).getTime() - new Date(firstJob.created_at).getTime()) / (365 * 24 * 60 * 60 * 1000)

        if (yearsBetween >= 1 && yearsBetween < 1.1) {
          wins.push({
            id: `returned-year-${lead.id}`,
            category: 'relationship',
            title: 'Customer Returned After 1 Year',
            description: `${lead.name || 'A customer'} has returned after a year`,
            achievedAt: lastJob.created_at,
            customerId: lead.id,
            customerName: lead.name,
            metadata: {}
          })
        }
      }
    })

    // 5-year customer relationship
    leads.forEach(lead => {
      const yearsSinceCreation = (now.getTime() - new Date(lead.created_at).getTime()) / (365 * 24 * 60 * 60 * 1000)
      if (yearsSinceCreation >= 5 && yearsSinceCreation < 5.1) {
        wins.push({
          id: `5-year-relationship-${lead.id}`,
          category: 'relationship',
          title: '5-Year Customer Relationship',
          description: `${lead.name || 'A customer'} has been with you for 5 years`,
          achievedAt: lead.created_at,
          customerId: lead.id,
          customerName: lead.name,
          metadata: {}
        })
      }
    })

    return wins.sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
  }

  /**
   * Detect growth wins
   */
  private detectGrowthWins(jobs: any[], payments: any[]): BusinessWin[] {
    const wins: BusinessWin[] = []
    const completedJobs = jobs.filter(j => j.status === 'completed')

    // Most jobs completed in one day
    const jobsByDate: Record<string, any[]> = {}
    completedJobs.forEach(job => {
      const date = new Date(job.created_at).toDateString()
      jobsByDate[date] = jobsByDate[date] || []
      jobsByDate[date].push(job)
    })

    const maxJobsInDay = Object.entries(jobsByDate).reduce((max, [date, dayJobs]) => {
      return dayJobs.length > max.count ? { date, count: dayJobs.length } : max
    }, { date: '', count: 0 })

    if (maxJobsInDay.count >= 5) {
      const dayJobs = jobsByDate[maxJobsInDay.date]
      wins.push({
        id: `most-jobs-day-${maxJobsInDay.date}`,
        category: 'growth',
        title: 'Most Jobs Completed in One Day',
        description: `You completed ${maxJobsInDay.count} jobs in a single day`,
        achievedAt: dayJobs[0].created_at,
        metadata: { value: maxJobsInDay.count }
      })
    }

    return wins.sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
  }

  /**
   * Detect customer milestone
   */
  private detectCustomerMilestone(lead: any, jobs: any[], payments: any[]): CustomerMilestone | null {
    const completedJobs = jobs.filter(j => j.status === 'completed')
    const jobCount = completedJobs.length

    // 5th completed job
    if (jobCount === 5) {
      return {
        id: '5th-job',
        title: '5th Completed Job',
        description: 'This customer has completed 5 jobs',
        achieved: true,
        achievedAt: completedJobs[0].created_at
      }
    }

    // Customer since year
    const createdYear = new Date(lead.created_at).getFullYear()
    const currentYear = new Date().getFullYear()
    if (createdYear < currentYear) {
      return {
        id: `customer-since-${createdYear}`,
        title: `Customer Since ${createdYear}`,
        description: `Customer since ${createdYear}`,
        achieved: true,
        achievedAt: lead.created_at
      }
    }

    // Lifetime revenue milestones
    let lifetimeRevenue = 0
    payments.forEach(p => {
      if (p.status === 'paid' && p.amount) {
        lifetimeRevenue += parseFloat(p.amount)
      }
    })
    completedJobs.forEach(j => {
      if (j.amount) {
        lifetimeRevenue += parseFloat(j.amount)
      }
    })

    if (lifetimeRevenue >= 1000 && lifetimeRevenue < 1500) {
      return {
        id: 'revenue-1000',
        title: '$1,000 Lifetime Revenue',
        description: `This customer has spent ${formatCurrency(lifetimeRevenue)}`,
        achieved: true,
        achievedAt: lead.created_at
      }
    }

    if (lifetimeRevenue >= 2500 && lifetimeRevenue < 3000) {
      return {
        id: 'revenue-2500',
        title: '$2,500 Lifetime Revenue',
        description: `This customer has spent ${formatCurrency(lifetimeRevenue)}`,
        achieved: true,
        achievedAt: lead.created_at
      }
    }

    return null
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Singleton instance
export const businessWinsService = new BusinessWinsService()
