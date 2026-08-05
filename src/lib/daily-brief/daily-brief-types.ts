/**
 * Daily Brief Type Definitions
 * 
 * The Daily Brief is a high-level intelligence surface that summarizes Focus items
 * into a concise briefing for the business owner.
 */

export type BriefSectionType = 'priorities' | 'money' | 'schedule' | 'customers' | 'health'

export interface BriefItem {
  id: string
  summary: string
  priority: 'urgent' | 'high' | 'medium' | 'low'
  category: 'money' | 'customers' | 'growth' | 'scheduling' | 'communication' | 'efficiency'
}

export interface BriefSection {
  type: BriefSectionType
  title: string
  items: BriefItem[]
  summary?: string // For sections that need a summary (like health)
}

export interface DailyBrief {
  id: string
  businessId: string
  generatedAt: string
  sections: BriefSection[]
  metadata: {
    totalFocusItems: number
    itemsSummarized: number
  }
}

export interface DailyBriefContext {
  businessId: string
  customerId?: string
  view?: 'dashboard' | 'customer' | 'schedule' | 'payments' | 'customers' | 'messaging'
}

export interface DailyBriefServiceInterface {
  generateBrief(context: DailyBriefContext): Promise<DailyBrief>
  getBrief(context: DailyBriefContext): Promise<DailyBrief | null>
  invalidateBrief(businessId: string): void
}
