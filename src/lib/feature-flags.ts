/**
 * Feature Flag System for Deployment Safety
 * 
 * Allows disabling broken features without redeploying.
 * Feature flags are controlled via environment variables.
 * 
 * Usage:
 * import { isFeatureEnabled } from '@/lib/feature-flags'
 * 
 * if (isFeatureEnabled('ai_voice')) {
 *   // AI voice feature code
 * }
 */

export type FeatureFlag =
  | 'ai_voice'           // AI voice assistant
  | 'ai_intake'          // AI intake field extraction
  | 'tap_to_pay'         // Tap to Pay terminal payments
  | 'stripe_connect'     // Stripe Connect onboarding
  | 'calendar_sync'      // Google Calendar sync
  | 'push_notifications' // Push notifications
  | 'smart_filtering'    // Smart call filtering

interface FeatureFlagConfig {
  name: FeatureFlag
  description: string
  defaultValue: boolean
  envVar: string
}

const FEATURE_FLAGS: FeatureFlagConfig[] = [
  {
    name: 'ai_voice',
    description: 'AI voice assistant for calls',
    defaultValue: true,
    envVar: 'FEATURE_FLAG_AI_VOICE',
  },
  {
    name: 'ai_intake',
    description: 'AI intake field extraction',
    defaultValue: true,
    envVar: 'FEATURE_FLAG_AI_INTAKE',
  },
  {
    name: 'tap_to_pay',
    description: 'Tap to Pay terminal payments',
    defaultValue: true,
    envVar: 'FEATURE_FLAG_TAP_TO_PAY',
  },
  {
    name: 'stripe_connect',
    description: 'Stripe Connect onboarding',
    defaultValue: true,
    envVar: 'FEATURE_FLAG_STRIPE_CONNECT',
  },
  {
    name: 'calendar_sync',
    description: 'Google Calendar sync',
    defaultValue: true,
    envVar: 'FEATURE_FLAG_CALENDAR_SYNC',
  },
  {
    name: 'push_notifications',
    description: 'Push notifications',
    defaultValue: true,
    envVar: 'FEATURE_FLAG_PUSH_NOTIFICATIONS',
  },
  {
    name: 'smart_filtering',
    description: 'Smart call filtering',
    defaultValue: true,
    envVar: 'FEATURE_FLAG_SMART_FILTERING',
  },
]

/**
 * Check if a feature is enabled
 * 
 * Priority:
 * 1. Environment variable (if set)
 * 2. Default value
 * 
 * @param feature - Feature flag name
 * @returns true if feature is enabled
 */
export function isFeatureEnabled(feature: FeatureFlag): boolean {
  const config = FEATURE_FLAGS.find(f => f.name === feature)
  if (!config) {
    console.warn(`[FEATURE FLAGS] Unknown feature flag: ${feature}`)
    return false
  }

  const envValue = process.env[config.envVar]
  
  // If env var is set, use it (accepts 'true', '1', 'enabled')
  if (envValue !== undefined && envValue !== '') {
    const enabled = envValue.toLowerCase() === 'true' || 
                    envValue === '1' || 
                    envValue.toLowerCase() === 'enabled'
    console.log(`[FEATURE FLAGS] ${feature}: ${enabled} (from env var)`)
    return enabled
  }

  // Otherwise use default
  console.log(`[FEATURE FLAGS] ${feature}: ${config.defaultValue} (default)`)
  return config.defaultValue
}

/**
 * Get all feature flag states
 * Useful for debugging and monitoring
 */
export function getAllFeatureFlags(): Record<FeatureFlag, boolean> {
  const flags: Partial<Record<FeatureFlag, boolean>> = {}
  
  for (const config of FEATURE_FLAGS) {
    flags[config.name] = isFeatureEnabled(config.name)
  }
  
  return flags as Record<FeatureFlag, boolean>
}

/**
 * Get feature flag configuration
 * Useful for documentation
 */
export function getFeatureFlagConfig(feature: FeatureFlag): FeatureFlagConfig | undefined {
  return FEATURE_FLAGS.find(f => f.name === feature)
}

/**
 * Get all feature flag configurations
 */
export function getAllFeatureFlagConfigs(): FeatureFlagConfig[] {
  return FEATURE_FLAGS
}