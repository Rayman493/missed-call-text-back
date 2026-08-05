/**
 * Focus Types
 * 
 * Focus is the unified intelligence surface for ReplyFlow.
 * All intelligent features surface through this single concept.
 * The user should never need to understand the underlying architecture.
 */

export enum FocusPriority {
  URGENT = 'urgent',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum FocusCategory {
  MONEY = 'money',
  CUSTOMERS = 'customers',
  GROWTH = 'growth',
  SCHEDULING = 'scheduling',
  COMMUNICATION = 'communication',
  EFFICIENCY = 'efficiency',
}

export enum FocusSource {
  INSIGHT = 'insight',
  ADVISOR = 'advisor',
  RECOMMENDATION = 'recommendation',
  TREND = 'trend',
  MOMENT = 'moment',
}

export interface FocusAction {
  label: string
  destination: string
  suggestedContent?: string
}

export interface FocusItem {
  id: string
  businessId: string
  customerId?: string
  
  // Content
  title: string
  summary: string
  reason: string
  confidence: number
  
  // Action
  recommendedAction?: FocusAction
  
  // Metadata
  priority: FocusPriority
  category: FocusCategory
  source: FocusSource
  
  // Temporal
  generatedAt: Date
  expiresAt: Date
}

export interface FocusContext {
  businessId: string
  customerId?: string
  view: 'dashboard' | 'customer' | 'schedule' | 'payments' | 'customers' | 'messaging'
}

export interface FocusService {
  getFocusItems(context: FocusContext): Promise<FocusItem[]>
  markItemShown(item: FocusItem): Promise<void>
  markItemCompleted(item: FocusItem): Promise<void>
  dismissItem(item: FocusItem): Promise<void>
}
