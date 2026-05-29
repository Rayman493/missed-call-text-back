/**
 * AI Call Assistant Configuration (Phase 0 - QA Only)
 * 
 * SAFETY: All features are disabled by default.
 * Production customers are NOT affected.
 */

/**
 * Global feature flag for AI Call Assistant
 * Must be explicitly enabled in environment variables
 */
export const AI_CONFIG = {
  // Global enable flag - MUST be false by default
  enabled: process.env.AI_CALL_ASSISTANT_ENABLED === 'true',
  
  // Public client flag - MUST be false by default
  publicEnabled: process.env.NEXT_PUBLIC_AI_CALL_ASSISTANT_ENABLED === 'true',
  
  // Comma-separated list of allowed business IDs for QA testing
  // Empty string = no businesses allowed
  allowedBusinessIds: process.env.AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS
    ? process.env.AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS.split(',').map(id => id.trim())
    : [],
  
  // OpenAI API configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: 'gpt-4o', // Phase 0: use stable model
    voice: 'alloy',
  },
  
  // Session configuration
  session: {
    maxDurationSeconds: 120, // 2 minutes max for Phase 0
    timeoutSeconds: 30, // 30s timeout for connection
  },
  
  // Phase 0: Simple intake script only
  intakeScript: {
    enabled: true,
    collectName: true,
    collectReason: true,
    collectUrgency: true,
    collectCallbackNumber: true,
  },
}

/**
 * Check if AI assistant is globally enabled
 */
export function isGloballyEnabled(): boolean {
  const enabled = AI_CONFIG.enabled && AI_CONFIG.publicEnabled
  
  if (!enabled) {
    console.log('[AI CALL ASSISTANT] Guard failed: Not globally enabled')
  } else {
    console.log('[AI CALL ASSISTANT] Guard passed: Globally enabled')
  }
  
  return enabled
}

/**
 * Check if a business is allowed to use AI assistant
 */
export function isBusinessAllowed(businessId: string): boolean {
  if (!AI_CONFIG.allowedBusinessIds || AI_CONFIG.allowedBusinessIds.length === 0) {
    console.log('[AI CALL ASSISTANT] Guard failed: No businesses allowed')
    return false
  }
  
  const allowed = AI_CONFIG.allowedBusinessIds.includes(businessId)
  
  if (!allowed) {
    console.log('[AI CALL ASSISTANT] Guard failed: Business not in allowlist', {
      businessId,
      allowedCount: AI_CONFIG.allowedBusinessIds.length
    })
  } else {
    console.log('[AI CALL ASSISTANT] Guard passed: Business allowed', { businessId })
  }
  
  return allowed
}

/**
 * Check if OpenAI API key is configured
 */
export function isOpenAIConfigured(): boolean {
  const configured = !!AI_CONFIG.openai.apiKey
  
  if (!configured) {
    console.log('[AI CALL ASSISTANT] Guard failed: OpenAI API key not configured')
  } else {
    console.log('[AI CALL ASSISTANT] Guard passed: OpenAI configured')
  }
  
  return configured
}

/**
 * Check if AI assistant is enabled for a specific business
 */
export function isBusinessAIEnabled(business: { ai_assistant_enabled?: boolean | null }): boolean {
  const enabled = business.ai_assistant_enabled === true
  
  if (!enabled) {
    console.log('[AI CALL ASSISTANT] Guard failed: Business AI assistant not enabled', {
      businessId: 'unknown',
      ai_assistant_enabled: business.ai_assistant_enabled
    })
  } else {
    console.log('[AI CALL ASSISTANT] Guard passed: Business AI assistant enabled', {
      businessId: 'unknown',
      ai_assistant_enabled: business.ai_assistant_enabled
    })
  }
  
  return enabled
}

/**
 * Check all guards for AI assistant
 * Returns true if all guards pass
 */
export function checkAllGuards(businessId: string, business?: { ai_assistant_enabled?: boolean | null }): { passed: boolean; reason: string } {
  console.log('[AI CALL ASSISTANT] Checking all guards...', { businessId })
  
  // Check 1: Global enable flag
  if (!isGloballyEnabled()) {
    return { passed: false, reason: 'not_globally_enabled' }
  }
  
  // Check 2: Business allowlist
  if (!isBusinessAllowed(businessId)) {
    return { passed: false, reason: 'business_not_allowed' }
  }
  
  // Check 3: Business-level AI enabled flag
  if (business && !isBusinessAIEnabled(business)) {
    return { passed: false, reason: 'business_ai_not_enabled' }
  }
  
  // Check 4: OpenAI configuration
  if (!isOpenAIConfigured()) {
    return { passed: false, reason: 'openai_not_configured' }
  }
  
  console.log('[AI CALL ASSISTANT] All guards passed - routing to AI assistant')
  return { passed: true, reason: 'all_guards_passed' }
}
