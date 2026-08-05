/**
 * Business Wins Type Definitions
 * 
 * Recognizes meaningful business milestones.
 * Not gamification - quiet recognition of real business progress.
 */

export type WinCategory = 
  | 'customer'
  | 'revenue'
  | 'operations'
  | 'relationship'
  | 'growth'

export interface BusinessWin {
  id: string
  category: WinCategory
  title: string
  description: string
  achievedAt: string
  customerId?: string
  customerName?: string
  metadata: {
    value?: number
    unit?: string
    comparison?: string
  }
}

export interface CustomerMilestone {
  id: string
  title: string
  description: string
  achieved: boolean
  achievedAt?: string
}

export interface BusinessWinsContext {
  businessId: string
  customerId?: string
}

export interface BusinessWinsServiceInterface {
  getRecentWins(context: BusinessWinsContext): Promise<BusinessWin[]>
  getCustomerMilestone(context: BusinessWinsContext): Promise<CustomerMilestone | null>
  invalidateCache(businessId: string): void
}
