/**
 * Customer Reactivation Type Definitions
 * 
 * Identifies customers representing high-value reactivation opportunities.
 */

export type ReactivationType = 
  | 'due_for_service'
  | 'seasonal_return'
  | 'high_lifetime_value'
  | 'one_time_customer'
  | 'long_inactive'

export type ReactivationAction = 
  | 'send_message'
  | 'open_customer'
  | 'schedule_job'

export interface ReactivationScore {
  score: number // 0-100
  factors: {
    lifetimeRevenue: number
    repeatHistory: number
    timeSinceLastService: number
    typicalBookingInterval: number
    favoriteService: number
    businessMemoryConfidence: number
    seasonality: number
    customerResponsiveness: number
  }
}

export interface SuggestedMessage {
  text: string
  isInformational: boolean // Always true - no auto-send
}

export interface CustomerReactivation {
  id: string
  customerId: string
  customerName: string
  type: ReactivationType
  score: ReactivationScore
  potentialValue: number | null
  reason: string
  lastServiceDate: string | null
  daysSinceLastService: number
  averageInterval: number | null
  recommendedAction: ReactivationAction
  suggestedMessage: SuggestedMessage | null
  metadata: {
    lifetimeRevenue: number
    jobCount: number
    lastJobTitle?: string
    season?: string
    inactivePeriod?: string
  }
}

export interface CustomerReactivationContext {
  businessId: string
  customerId?: string
}

export interface CustomerReactivationServiceInterface {
  getReactivations(context: CustomerReactivationContext): Promise<CustomerReactivation[]>
  getReactivation(context: CustomerReactivationContext): Promise<CustomerReactivation | null>
  invalidateCache(businessId: string): void
}
