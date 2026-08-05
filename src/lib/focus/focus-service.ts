/**
 * Focus Service
 * 
 * The only UI-facing intelligence API.
 * Orchestrates all internal intelligence systems into a unified Focus experience.
 */

import { FocusItem, FocusContext, FocusPriority, FocusSource, FocusCategory, FocusAction, FocusService as FocusServiceInterface } from './focus-types'
import { generateDashboardInsights, generateCustomerInsights } from '@/lib/insights/insights-service'
import { generateDashboardSuggestedActions, generateCustomerSuggestedActions } from '@/lib/suggested-actions/suggested-actions-service'
import { Insight } from '@/lib/insights/types'
import { SuggestedAction } from '@/lib/suggested-actions/types'
import { createBrowserClient } from '@/lib/supabase/browser'

export class FocusService implements FocusServiceInterface {
  private cache: Map<string, { items: FocusItem[]; expiresAt: Date }> = new Map()
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

  async getFocusItems(context: FocusContext): Promise<FocusItem[]> {
    const cacheKey = this.getCacheKey(context)
    const cached = this.cache.get(cacheKey)
    
    if (cached && cached.expiresAt > new Date()) {
      return cached.items
    }

    const items: FocusItem[] = []
    const supabase = createBrowserClient()

    // Gather intelligence from all internal systems
    if (context.view === 'dashboard') {
      // Dashboard-level intelligence
      const insights = await generateDashboardInsights(context.businessId, supabase)
      items.push(...this.mapInsightsToFocus(insights, context))

      const actions = await generateDashboardSuggestedActions(insights)
      items.push(...this.mapActionsToFocus(actions, context))
    } else if (context.view === 'customer' && context.customerId) {
      // Customer-specific intelligence
      const insights = await generateCustomerInsights(context.businessId, context.customerId, supabase)
      items.push(...this.mapInsightsToFocus(insights, context))

      const actions = await generateCustomerSuggestedActions(insights)
      items.push(...this.mapActionsToFocus(actions, context))
    }

    // Filter by context and quality gates
    const filtered = this.filterByContext(items, context)
    const qualified = this.applyQualityGates(filtered)
    const prioritized = this.prioritizeItems(qualified)

    // Cache results
    this.cache.set(cacheKey, {
      items: prioritized,
      expiresAt: new Date(Date.now() + this.CACHE_DURATION_MS)
    })

    return prioritized.slice(0, 5) // Maximum 5 items
  }

  async markItemShown(item: FocusItem): Promise<void> {
    // Track that item was shown to user
    // This is for learning and analytics
    console.log('[FocusService] Item shown:', item.id)
  }

  async markItemCompleted(item: FocusItem): Promise<void> {
    // Track that user completed the recommended action
    console.log('[FocusService] Item completed:', item.id)
    
    // Invalidate cache for this context
    this.invalidateCacheForBusiness(item.businessId)
  }

  async dismissItem(item: FocusItem): Promise<void> {
    // Track that user dismissed the item
    console.log('[FocusService] Item dismissed:', item.id)
    
    // Invalidate cache for this context
    this.invalidateCacheForBusiness(item.businessId)
  }

  private mapInsightsToFocus(insights: Insight[], context: FocusContext): FocusItem[] {
    return insights.map(insight => ({
      id: insight.id,
      businessId: context.businessId,
      customerId: insight.customerId,
      title: insight.title,
      summary: insight.description,
      reason: this.getInsightReason(insight),
      confidence: insight.confidence || 0,
      recommendedAction: insight.primaryAction ? {
        label: insight.primaryAction.label,
        destination: insight.primaryAction.href,
      } : undefined,
      priority: this.mapConfidenceToPriority(insight.confidence || 0),
      category: this.mapInsightTypeToCategory(insight.type),
      source: FocusSource.INSIGHT,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    }))
  }

  private mapActionsToFocus(actions: SuggestedAction[], context: FocusContext): FocusItem[] {
    return actions.map(action => ({
      id: action.id,
      businessId: context.businessId,
      customerId: action.customerId,
      title: action.title,
      summary: action.recommendedAction,
      reason: action.reason || 'Based on your business patterns',
      confidence: action.confidence,
      recommendedAction: {
        label: action.title,
        destination: action.destinationLink,
        suggestedContent: action.suggestedMessage,
      },
      priority: FocusPriority.HIGH,
      category: this.mapActionTypeToCategory(action.actionType),
      source: FocusSource.RECOMMENDATION,
      generatedAt: new Date(action.createdAt),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    }))
  }

  private getInsightReason(insight: Insight): string {
    // Generate a clear "why now" explanation
    if (insight.reason) {
      return insight.reason
    }
    return 'This requires your attention'
  }

  private mapConfidenceToPriority(confidence: number): FocusPriority {
    if (confidence >= 90) return FocusPriority.URGENT
    if (confidence >= 80) return FocusPriority.HIGH
    if (confidence >= 70) return FocusPriority.MEDIUM
    return FocusPriority.LOW
  }

  private mapInsightTypeToCategory(type: string): FocusCategory {
    const categoryMap: Record<string, FocusCategory> = {
      'payment': FocusCategory.MONEY,
      'follow-up': FocusCategory.COMMUNICATION,
      'scheduling': FocusCategory.SCHEDULING,
      'communication': FocusCategory.COMMUNICATION,
      'customer-preference': FocusCategory.CUSTOMERS,
      'business-trend': FocusCategory.GROWTH,
      'workflow-reminder': FocusCategory.EFFICIENCY,
    }
    return categoryMap[type] || FocusCategory.EFFICIENCY
  }

  private mapActionTypeToCategory(actionType: string): FocusCategory {
    const categoryMap: Record<string, FocusCategory> = {
      'send-message': FocusCategory.COMMUNICATION,
      'schedule-appointment': FocusCategory.SCHEDULING,
      'confirm-appointment': FocusCategory.SCHEDULING,
      'request-payment': FocusCategory.MONEY,
    }
    return categoryMap[actionType] || FocusCategory.EFFICIENCY
  }

  private filterByContext(items: FocusItem[], context: FocusContext): FocusItem[] {
    switch (context.view) {
      case 'dashboard':
        // Show business-wide items only
        return items.filter(item => !item.customerId)
      case 'customer':
        // Show customer-specific items only
        return items.filter(item => item.customerId === context.customerId)
      case 'schedule':
        // Show scheduling-related items
        return items.filter(item => 
          item.category === FocusCategory.SCHEDULING ||
          item.category === FocusCategory.EFFICIENCY
        )
      case 'payments':
        // Show money-related items only
        return items.filter(item => item.category === FocusCategory.MONEY)
      case 'customers':
        // Show customer-related items
        return items.filter(item => item.category === FocusCategory.CUSTOMERS)
      case 'messaging':
        // Show communication-related items
        return items.filter(item => 
          item.category === FocusCategory.COMMUNICATION ||
          item.category === FocusCategory.CUSTOMERS
        )
      default:
        return items
    }
  }

  private applyQualityGates(items: FocusItem[]): FocusItem[] {
    return items.filter(item => {
      // Confidence threshold
      if (item.confidence < 70) return false
      
      // Not expired
      if (new Date() > item.expiresAt) return false
      
      // Must have action (except for trends)
      if (item.source !== FocusSource.TREND && !item.recommendedAction) return false
      
      return true
    })
  }

  private prioritizeItems(items: FocusItem[]): FocusItem[] {
    const priorityOrder = {
      [FocusPriority.URGENT]: 0,
      [FocusPriority.HIGH]: 1,
      [FocusPriority.MEDIUM]: 2,
      [FocusPriority.LOW]: 3,
    }

    return items.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      
      // Within same priority, sort by confidence
      return b.confidence - a.confidence
    })
  }

  private getCacheKey(context: FocusContext): string {
    return `${context.businessId}-${context.view}-${context.customerId || 'all'}`
  }

  invalidateCacheForBusiness(businessId: string): void {
    // Invalidate all cache entries for this business
    for (const [key] of this.cache) {
      if (key.startsWith(businessId)) {
        this.cache.delete(key)
      }
    }
  }
}

// Singleton instance
export const focusService = new FocusService()
