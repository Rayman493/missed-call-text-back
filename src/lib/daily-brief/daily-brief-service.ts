/**
 * Daily Brief Service
 * 
 * Consumes FocusService to generate a concise daily briefing.
 * This is the highest-level intelligence surface in ReplyFlow.
 */

import { focusService } from '../focus/focus-service'
import type { FocusItem } from '../focus/focus-types'
import type {
  DailyBrief,
  DailyBriefContext,
  BriefSection,
  BriefItem,
  DailyBriefServiceInterface
} from './daily-brief-types'

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

class DailyBriefService implements DailyBriefServiceInterface {
  private cache: Map<string, { brief: DailyBrief; timestamp: number }> = new Map()

  /**
   * Generate a daily brief from Focus items
   */
  async generateBrief(context: DailyBriefContext): Promise<DailyBrief> {
    const cacheKey = this.getCacheKey(context)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.brief
    }

    // Fetch Focus items (provide default view)
    const focusContext = {
      businessId: context.businessId,
      customerId: context.customerId,
      view: context.view || 'dashboard'
    }
    const focusItems = await focusService.getFocusItems(focusContext)

    // Build brief sections
    const sections = this.buildSections(focusItems)

    const brief: DailyBrief = {
      id: `brief-${context.businessId}-${Date.now()}`,
      businessId: context.businessId,
      generatedAt: new Date().toISOString(),
      sections,
      metadata: {
        totalFocusItems: focusItems.length,
        itemsSummarized: this.countSummarizedItems(sections)
      }
    }

    // Cache the brief
    this.cache.set(cacheKey, { brief, timestamp: Date.now() })

    return brief
  }

  /**
   * Get cached brief or null
   */
  async getBrief(context: DailyBriefContext): Promise<DailyBrief | null> {
    const cacheKey = this.getCacheKey(context)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.brief
    }

    return null
  }

  /**
   * Invalidate cached brief for a business
   */
  invalidateBrief(businessId: string): void {
    // Invalidate all cache entries for this business
    for (const [key, value] of this.cache.entries()) {
      if (value.brief.businessId === businessId) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Build brief sections from Focus items
   */
  private buildSections(focusItems: FocusItem[]): BriefSection[] {
    const sections: BriefSection[] = []

    // Today's Priorities (max 3, highest urgency)
    const priorities = this.buildPrioritiesSection(focusItems)
    if (priorities.items.length > 0) {
      sections.push(priorities)
    }

    // Money section
    const money = this.buildMoneySection(focusItems)
    if (money.items.length > 0) {
      sections.push(money)
    }

    // Schedule section
    const schedule = this.buildScheduleSection(focusItems)
    if (schedule.items.length > 0) {
      sections.push(schedule)
    }

    // Customers section
    const customers = this.buildCustomersSection(focusItems)
    if (customers.items.length > 0) {
      sections.push(customers)
    }

    // Business Health section (always include if we have items)
    const health = this.buildHealthSection(focusItems)
    if (health) {
      sections.push(health)
    }

    return sections
  }

  /**
   * Build Today's Priorities section (max 3 items)
   */
  private buildPrioritiesSection(focusItems: FocusItem[]): BriefSection {
    // Filter for urgent and high priority items
    const urgentItems = focusItems.filter(item => 
      item.priority === 'urgent' || item.priority === 'high'
    )

    // Take top 3
    const topPriorities = urgentItems.slice(0, 3)

    return {
      type: 'priorities',
      title: "Today's Priorities",
      items: topPriorities.map(item => this.mapFocusToBriefItem(item))
    }
  }

  /**
   * Build Money section
   */
  private buildMoneySection(focusItems: FocusItem[]): BriefSection {
    const moneyItems = focusItems.filter(item => item.category === 'money')
    
    return {
      type: 'money',
      title: 'Money',
      items: moneyItems.slice(0, 3).map(item => this.mapFocusToBriefItem(item))
    }
  }

  /**
   * Build Schedule section
   */
  private buildScheduleSection(focusItems: FocusItem[]): BriefSection {
    const scheduleItems = focusItems.filter(item => item.category === 'scheduling')
    
    return {
      type: 'schedule',
      title: 'Schedule',
      items: scheduleItems.slice(0, 3).map(item => this.mapFocusToBriefItem(item))
    }
  }

  /**
   * Build Customers section
   */
  private buildCustomersSection(focusItems: FocusItem[]): BriefSection {
    const customerItems = focusItems.filter(item => item.category === 'customers')
    
    return {
      type: 'customers',
      title: 'Customers',
      items: customerItems.slice(0, 3).map(item => this.mapFocusToBriefItem(item))
    }
  }

  /**
   * Build Business Health section (one sentence)
   */
  private buildHealthSection(focusItems: FocusItem[]): BriefSection | null {
    if (focusItems.length === 0) {
      return null
    }

    // Analyze the overall health based on Focus items
    const urgentCount = focusItems.filter(i => i.priority === 'urgent').length
    const highCount = focusItems.filter(i => i.priority === 'high').length
    const totalCount = focusItems.length

    let summary: string

    if (urgentCount === 0 && highCount === 0) {
      summary = 'Business is running smoothly.'
    } else if (urgentCount > 2) {
      summary = 'Several urgent items need attention today.'
    } else if (urgentCount > 0) {
      summary = 'One or two urgent items need your attention.'
    } else if (highCount > 3) {
      summary = 'Several high-priority items on your radar.'
    } else {
      summary = 'Business is operating normally with a few items to address.'
    }

    return {
      type: 'health',
      title: 'Business Health',
      items: [],
      summary
    }
  }

  /**
   * Map FocusItem to BriefItem
   */
  private mapFocusToBriefItem(item: FocusItem): BriefItem {
    return {
      id: item.id,
      summary: item.summary,
      priority: item.priority,
      category: item.category
    }
  }

  /**
   * Count total items summarized across all sections
   */
  private countSummarizedItems(sections: BriefSection[]): number {
    return sections.reduce((total, section) => total + section.items.length, 0)
  }

  /**
   * Generate cache key from context
   */
  private getCacheKey(context: DailyBriefContext): string {
    const parts = [context.businessId]
    if (context.customerId) parts.push(context.customerId)
    if (context.view) parts.push(context.view)
    return parts.join(':')
  }
}

// Singleton instance
export const dailyBriefService = new DailyBriefService()
