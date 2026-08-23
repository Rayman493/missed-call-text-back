/**
 * Lead Source Normalization Utility
 *
 * Shared logic for normalizing raw source values to canonical categories
 * Used by LeadsSourceGraph component and tests
 */

export interface NormalizedSourceData {
  name: string
  value: number
  color: string
}

export interface SourceNormalizationResult {
  chartData: NormalizedSourceData[]
  unclassifiedCount: number
}

const SOURCE_COLORS: Record<string, string> = {
  replyflow_intake: '#8B5CF6',
  manual: '#F59E0B',
  excluded: '#94A3B8',
  unclassified: '#94A3B8'
}

const SOURCE_LABELS: Record<string, string> = {
  replyflow_intake: 'ReplyFlow Intake',
  manual: 'Manually Added',
  excluded: 'Excluded',
  unclassified: 'Unclassified'
}

/**
 * Normalize explicit source to canonical value
 */
function normalizeExplicitSource(source: string): string | null {
  if (!source || source === 'unknown') return null

  // ReplyFlow Intake: all automatic ReplyFlow acquisition paths
  if (source === 'voice' || source === 'ai_voice' || source === 'call_intake' || source === 'ai_intake' || source === 'sms') {
    return 'replyflow_intake'
  }

  // Manually Added: merchant/user-created leads
  if (source === 'manual' || source === 'manual_payment_request' || source === 'manual_entry' || source === 'manual_backfill') {
    return 'manual'
  }

  // Test/demo leads - excluded
  if (source === 'admin_test' || source === 'demo') {
    return 'excluded'
  }

  // Web source - unclassified (no proven acquisition meaning)
  if (source === 'web') {
    return 'unclassified'
  }

  // Unknown source value
  return 'unclassified'
}

/**
 * Normalize source counts to chart data
 * This is the actual production logic from LeadsSourceGraph
 */
export function normalizeSourceCounts(sourceCounts: Record<string, number>): SourceNormalizationResult {
  const normalizedCounts: { [key: string]: number } = {}
  let localUnclassifiedCount = 0

  Object.entries(sourceCounts).forEach(([source, count]) => {
    let normalizedSource: string | null = null

    // Exclude test/demo leads
    if (source === 'admin_test' || source === 'demo') {
      return
    }

    // Map to customer-facing categories based on creation path audit
    if (source === 'voice' || source === 'ai_voice' || source === 'call_intake' || source === 'ai_intake' || source === 'sms') {
      // ReplyFlow Intake: all automatic ReplyFlow acquisition paths (missed calls, SMS)
      normalizedSource = 'replyflow_intake'
    } else if (source === 'manual' || source === 'manual_payment_request' || source === 'manual_entry' || source === 'manual_backfill') {
      // Manually Added: leads created by user via manual entry or payment request
      normalizedSource = 'manual'
    } else {
      // Unclassified: source value not proven in audit (including 'web')
      normalizedSource = 'unclassified'
    }

    if (normalizedSource === 'unclassified') {
      localUnclassifiedCount += count
    } else if (normalizedSource) {
      normalizedCounts[normalizedSource] = (normalizedCounts[normalizedSource] || 0) + count
    }
  })

  // Convert to array for chart, filtering out zero-value sectors
  // Zero-value sectors can cause rendering issues in Recharts
  const chartData = Object.entries(normalizedCounts)
    .filter(([_, count]) => count > 0)
    .map(([source, count]) => ({
      name: SOURCE_LABELS[source] || source,
      value: count,
      color: SOURCE_COLORS[source] || '#94A3B8'
    }))

  return { chartData, unclassifiedCount: localUnclassifiedCount }
}