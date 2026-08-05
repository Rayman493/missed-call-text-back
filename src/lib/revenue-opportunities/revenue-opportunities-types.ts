/**
 * Revenue Opportunities Type Definitions
 * 
 * Identifies customers representing immediate revenue opportunities.
 */

export type OpportunityType = 
  | 'repeat_customer'
  | 'ready_for_estimate'
  | 'ready_for_invoice'
  | 'follow_up'
  | 'seasonal'

export type OpportunityAction = 
  | 'send_estimate'
  | 'request_payment'
  | 'schedule_job'
  | 'open_customer'
  | 'send_follow_up'

export interface OpportunityScore {
  score: number // 0-100
  factors: {
    expectedRevenue: number
    customerValue: number
    repeatHistory: number
    conversionLikelihood: number
    daysSinceLastInteraction: number
    businessMemoryConfidence: number
    outstandingWork: number
  }
}

export interface RevenueOpportunity {
  id: string
  customerId: string
  customerName: string
  type: OpportunityType
  score: OpportunityScore
  estimatedValue: number | null
  whyNow: string
  recommendedAction: OpportunityAction
  metadata: {
    lastJobDate?: string
    normalInterval?: number // days
    daysSinceLastInteraction: number
    completedIntake: boolean
    hasEstimate: boolean
    hasJob: boolean
    hasPaymentRequest: boolean
    season?: string
  }
}

export interface RevenueOpportunitiesContext {
  businessId: string
  customerId?: string
}

export interface RevenueOpportunitiesServiceInterface {
  getOpportunities(context: RevenueOpportunitiesContext): Promise<RevenueOpportunity[]>
  getOpportunity(context: RevenueOpportunitiesContext): Promise<RevenueOpportunity | null>
  invalidateCache(businessId: string): void
}
