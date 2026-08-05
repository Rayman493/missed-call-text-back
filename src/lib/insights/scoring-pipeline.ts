import { Insight, InsightPriority } from './types'

const PRIORITY_SCORE: Record<InsightPriority, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25
}

/**
 * Calculate a composite score for an insight based on priority and confidence
 */
function calculateScore(insight: Insight): number {
  const priorityScore = PRIORITY_SCORE[insight.priority]
  const confidenceScore = insight.confidence ?? 80
  return (priorityScore * 0.7) + (confidenceScore * 0.3)
}

/**
 * Check if an insight has expired
 */
function isExpired(insight: Insight): boolean {
  if (!insight.expiresAt) return false
  return new Date(insight.expiresAt) < new Date()
}

/**
 * Deduplicate similar insights by merging them
 */
function deduplicateInsights(insights: Insight[]): Insight[] {
  const deduplicatedMap = new Map<string, Insight>()

  for (const insight of insights) {
    const key = `${insight.customerId || 'global'}-${insight.type}-${insight.category}`
    const existing = deduplicatedMap.get(key)

    if (existing) {
      // Merge similar insights - keep the one with higher priority
      const existingScore = calculateScore(existing)
      const newScore = calculateScore(insight)

      if (newScore > existingScore) {
        deduplicatedMap.set(key, insight)
      }
    } else {
      deduplicatedMap.set(key, insight)
    }
  }

  return Array.from(deduplicatedMap.values())
}

/**
 * Sort insights by score (descending), then by creation date (descending)
 */
function sortInsights(insights: Insight[]): Insight[] {
  return insights.sort((a, b) => {
    const scoreA = calculateScore(a)
    const scoreB = calculateScore(b)

    if (scoreA !== scoreB) {
      return scoreB - scoreA
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

/**
 * Process insights through the scoring pipeline
 * - Remove expired insights
 * - Deduplicate similar insights
 * - Sort by priority and confidence
 */
export function processInsightsPipeline(insights: Insight[]): Insight[] {
  // Remove expired insights
  const activeInsights = insights.filter(insight => !isExpired(insight))

  // Deduplicate similar insights
  const deduplicatedInsights = deduplicateInsights(activeInsights)

  // Sort by priority and confidence
  const sortedInsights = sortInsights(deduplicatedInsights)

  return sortedInsights
}

/**
 * Calculate a business health score based on insights
 * Returns a score from 0-100
 */
export function calculateBusinessHealth(insights: Insight[]): number {
  if (insights.length === 0) return 100

  const criticalCount = insights.filter(i => i.priority === 'critical').length
  const highCount = insights.filter(i => i.priority === 'high').length
  const mediumCount = insights.filter(i => i.priority === 'medium').length
  const lowCount = insights.filter(i => i.priority === 'low').length

  // Weighted score calculation
  const total = insights.length
  const weightedSum = (
    (criticalCount * 0) +
    (highCount * 25) +
    (mediumCount * 50) +
    (lowCount * 75)
  )

  return Math.round(weightedSum / total)
}
