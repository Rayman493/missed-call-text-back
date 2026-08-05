export type InsightType =
  | 'payment'
  | 'follow-up'
  | 'scheduling'
  | 'communication'
  | 'customer-preference'
  | 'business-trend'
  | 'workflow-reminder'

export type InsightPriority = 'critical' | 'high' | 'medium' | 'low'

export type InsightCategory = 'money' | 'scheduling' | 'communication' | 'customers' | 'growth' | 'operations'

export interface InsightAction {
  label: string
  href: string
  type: 'navigate' | 'action'
}

export interface Insight {
  id: string
  type: InsightType
  category: InsightCategory
  priority: InsightPriority
  title: string
  description: string
  actionable: boolean
  customerId?: string
  expiresAt?: string
  confidence?: number
  reason?: string
  primaryAction?: InsightAction
  metadata?: Record<string, any>
  createdAt: string
}

export interface InsightGenerator {
  type: InsightType
  generate: (context: InsightContext) => Promise<Insight[]>
}

export interface InsightContext {
  businessId: string
  supabase: any
  customerId?: string
  timeRange?: 'today' | 'week' | 'month'
}
