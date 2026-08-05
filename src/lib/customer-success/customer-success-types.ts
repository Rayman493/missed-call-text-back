/**
 * Customer Success Type Definitions
 * 
 * Helps customers become lifelong customers through customer success,
 * not marketing automation. Focuses on turning completed jobs into
 * long-term customer relationships.
 */

export type OpportunityType = 
  | 'review_request'
  | 'referral'
  | 'maintenance'
  | 'loyalty_milestone'

export type CustomerHealth = 
  | 'excellent'
  | 'healthy'
  | 'needs_attention'
  | 'at_risk'

export interface CustomerSuccessOpportunity {
  id: string
  customerId: string
  customerName: string
  type: OpportunityType
  title: string
  description: string
  reason: string
  timing: string
  potentialValue: number
  priority: 'high' | 'medium' | 'low'
  metadata: {
    relatedJobId?: string
    serviceType?: string
    milestone?: string
    nextServiceDate?: string
  }
}

export interface CustomerSuccessProfile {
  customerId: string
  customerName: string
  health: CustomerHealth
  healthFactors: {
    communication: number // 0-100
    payments: number // 0-100
    repeatBusiness: number // 0-100
    recentActivity: number // 0-100
  }
  nextOpportunity?: CustomerSuccessOpportunity
  lifetimeRevenue: number
  completedJobs: number
  relationshipAge: string
  loyaltyMilestones: LoyaltyMilestone[]
}

export interface LoyaltyMilestone {
  id: string
  type: 'job_count' | 'revenue' | 'tenure' | 'payment_reliability' | 'communication'
  title: string
  description: string
  achieved: boolean
  achievedAt?: string
}

export interface CustomerSuccessContext {
  businessId: string
  customerId?: string
}

export interface CustomerSuccessServiceInterface {
  getSuccessProfile(context: CustomerSuccessContext): Promise<CustomerSuccessProfile | null>
  getOpportunities(businessId: string): Promise<CustomerSuccessOpportunity[]>
  invalidateCache(businessId: string): void
}
