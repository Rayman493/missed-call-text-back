/**
 * ReplyFlow Assistant - Core types
 *
 * V1: Documentation search only
 * Future: Add knowledge providers for business settings, account config,
 * AI call diagnostics, SMS delivery, Twilio status, Google Calendar status,
 * Stripe billing, notifications, lead info, system health.
 */

export interface AssistantContext {
  currentPage?: 'dashboard' | 'leads' | 'lead-detail' | 'calendar' | 'settings' | 'onboarding'
  hasLeads?: boolean
  hasRecentActivity?: boolean
  forwardingVerified?: boolean
  calendarConnected?: boolean
  hasNotifications?: boolean
  isTrial?: boolean
  businessId?: string
  userId?: string
}

export interface AssistantArticle {
  id: string
  question: string
  answer: string
  summary: string
  category: string
  source: string
  keywords: string[]
  readingTime?: number
  lastUpdated?: string
  relatedQuestions?: string[]
}

export interface SearchResult {
  article: AssistantArticle
  score: number
  confidence: 'high' | 'medium' | 'low'
  matchedTerms: string[]
}

export interface KnowledgeProvider {
  readonly id: string
  readonly name: string
  /** Higher priority providers run first and may override lower-priority results. */
  readonly priority: number
  /** True if this provider can answer the given query in the current context. */
  canAnswer(query: string, context: AssistantContext): boolean
  /** Return search results for the query. */
  search(query: string, context: AssistantContext, options?: AssistantSearchOptions): SearchResult[]
}

export interface AssistantSearchOptions {
  /** Minimum score for a result to be considered at all. */
  minScore?: number
  /** Confidence threshold for results shown in the UI. */
  minConfidence?: 'high' | 'medium' | 'low'
  /** Maximum number of results to return. */
  limit?: number
  /** Boost results in this category. */
  preferredCategory?: string
}

export const CONFIDENCE_RANK: Record<SearchResult['confidence'], number> = {
  high: 3,
  medium: 2,
  low: 1,
}
