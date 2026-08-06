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

    // Today's Priorities (max 3, highest urgency, exclude generic schedule)
    const priorities = this.buildPrioritiesSection(focusItems)
    sections.push(priorities)

    // Track item IDs already surfaced to avoid cross-section duplication
    const usedIds = new Set<string>(
      priorities.items
        .filter(i => !i.id.startsWith('placeholder-'))
        .map(i => i.id)
    )

    // Money section (exclude anything already shown in priorities)
    const money = this.buildMoneySection(focusItems, usedIds)
    if (money.items.length > 0) {
      sections.push(money)
      money.items.forEach(i => { if (!i.id.startsWith('placeholder-')) usedIds.add(i.id) })
    }

    // Schedule section (exclude duplicates; include explicit empty-state message when none)
    const schedule = this.buildScheduleSection(focusItems, usedIds)
    sections.push(schedule)
    schedule.items.forEach(i => { if (!i.id.startsWith('placeholder-')) usedIds.add(i.id) })

    // Customers section (exclude anything already shown)
    const customers = this.buildCustomersSection(focusItems, usedIds)
    if (customers.items.length > 0) {
      sections.push(customers)
      customers.items.forEach(i => { if (!i.id.startsWith('placeholder-')) usedIds.add(i.id) })
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
    // Filter for urgent/high priority items that are actionable
    // Exclude generic scheduling notices from priorities unless explicitly urgent (e.g., starts soon/overdue)
    const urgentItems = focusItems.filter(item => item.priority === 'urgent' || item.priority === 'high')
    const actionable = urgentItems.filter(item => {
      const isScheduling = item.category === 'scheduling'
      if (!isScheduling) return true
      const text = `${item.title} ${item.summary}`.toLowerCase()
      const looksUrgent = /(overdue|late|starting soon|starts in|due now|in \d+\s?(min|minute))/i.test(text)
      const isGenericSchedule = /scheduled work today/i.test(text)
      return looksUrgent && !isGenericSchedule
    })

    const topPriorities = actionable.slice(0, 3)

    // If no actionable priorities, surface explicit empty state per spec
    const items: BriefItem[] = topPriorities.length > 0
      ? topPriorities.map(item => this.mapFocusToBriefItem(item))
      : [{ id: 'placeholder-priorities', summary: 'Nothing urgent today.', priority: 'low' as const, category: 'efficiency' as const, isPlaceholder: true } as BriefItem]

    return {
      type: 'priorities',
      title: "Today's Priorities",
      items,
    }
  }

  /**
   * Build Money section
   */
  private buildMoneySection(focusItems: FocusItem[], excludeIds?: Set<string>): BriefSection {
    const moneyItems = focusItems.filter(item => item.category === 'money' && !(excludeIds && excludeIds.has(item.id)))
    return {
      type: 'money',
      title: 'Money',
      items: moneyItems.slice(0, 3).map(item => this.mapFocusToBriefItem(item))
    }
  }

  /**
   * Build Schedule section
   */
  private buildScheduleSection(focusItems: FocusItem[], excludeIds?: Set<string>): BriefSection {
    // Only show actual appointment/event-derived items; exclude generic duplicate notices
    const scheduleItems = focusItems.filter(item => item.category === 'scheduling' && !(excludeIds && excludeIds.has(item.id)))
    const filtered = scheduleItems.filter(item => {
      const text = `${item.title} ${item.summary}`.toLowerCase()
      // Exclude generic duplicates like "You have scheduled work today"
      const isGeneric = /scheduled work today/i.test(text)
      return !isGeneric
    })

    const mapped = filtered.slice(0, 3).map(item => this.mapFocusToBriefItem(item))
    const items: BriefItem[] = mapped.length > 0
      ? mapped
      : [{ id: 'placeholder-schedule', summary: 'No appointments scheduled today.', priority: 'low' as const, category: 'efficiency' as const, isPlaceholder: true } as BriefItem]

    return {
      type: 'schedule',
      title: 'Schedule',
      items,
    }
  }

  /**
   * Build Customers section
   */
  private buildCustomersSection(focusItems: FocusItem[], excludeIds?: Set<string>): BriefSection {
    const customerItems = focusItems.filter(item => item.category === 'customers' && !(excludeIds && excludeIds.has(item.id)))
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
