import { Provenance } from './types'

/**
 * Minimum sample sizes required for confident conclusions
 */
export const MINIMUM_SAMPLE_SIZES = {
  preferredAppointmentTime: 3,
  preferredContactMethod: 5,
  preferredDay: 3,
  repeatCustomer: 2,
  averageResponseDelay: 2,
  averagePaymentDelay: 2,
  averageJobValue: 1,
  favoriteService: 2,
  busiestDay: 5,
  busiestTimeOfDay: 5,
  averageJobsPerWeek: 4,
} as const

/**
 * Confidence calculation based on sample size
 * Returns confidence level (0-100)
 */
export function calculateConfidence(sampleSize: number, minRequired: number): number {
  if (sampleSize < minRequired) {
    // Below minimum: confidence drops sharply
    return Math.max(0, Math.round((sampleSize / minRequired) * 50))
  }
  
  // At or above minimum: confidence approaches 100 asymptotically
  const excessRatio = (sampleSize - minRequired) / minRequired
  return Math.min(100, Math.round(70 + (excessRatio * 30)))
}

/**
 * Check if sample size meets minimum threshold
 */
export function meetsMinimumThreshold(sampleSize: number, fieldType: keyof typeof MINIMUM_SAMPLE_SIZES): boolean {
  const minRequired = MINIMUM_SAMPLE_SIZES[fieldType]
  return sampleSize >= minRequired
}

/**
 * Create provenance metadata
 */
export function createProvenance(
  derivedFrom: string,
  sampleSize: number,
  minRequired: number,
  explanation?: string
): Provenance {
  return {
    derivedFrom,
    sampleSize,
    lastUpdated: new Date().toISOString(),
    confidence: calculateConfidence(sampleSize, minRequired),
    explanation,
  }
}

/**
 * Safe average calculation with division by zero protection
 */
export function safeAverage(values: number[]): number | undefined {
  if (!values || values.length === 0) return undefined
  const sum = values.reduce((acc, val) => acc + val, 0)
  return sum / values.length
}

/**
 * Safe sum calculation
 */
export function safeSum(values: number[]): number {
  if (!values || values.length === 0) return 0
  return values.reduce((acc, val) => acc + val, 0)
}

/**
 * Remove duplicates from array based on key function
 */
export function removeDuplicates<T>(array: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  return array.filter(item => {
    const key = keyFn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Filter valid timestamps (removes null, undefined, and invalid dates)
 */
export function filterValidTimestamps(timestamps: (string | null | undefined)[]): string[] {
  return timestamps
    .filter((ts): ts is string => !!ts)
    .filter(ts => !isNaN(new Date(ts).getTime()))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
}
