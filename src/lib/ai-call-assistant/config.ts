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
  allowedBusinessIds: (() => {
    const raw = process.env.AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS?.trim() ?? ''
    
    // Debug logging
    console.log('[AI ALLOWLIST DEBUG] rawEnvValue=', JSON.stringify(raw))
    
    // Treat 'true' or 'false' as blank (these are likely boolean coercion issues)
    if (raw === '' || raw === 'true' || raw === 'false') {
      if (raw === 'true' || raw === 'false') {
        console.warn('[AI ALLOWLIST DEBUG] WARNING: Environment variable contains boolean value, treating as blank')
      }
      console.log('[AI ALLOWLIST DEBUG] parsedAllowlist=[]')
      return []
    }
    
    const allowedBusinessIds = raw
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
    
    console.log('[AI ALLOWLIST DEBUG] parsedAllowlist=', allowedBusinessIds)
    return allowedBusinessIds
  })(),
  
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
 * Allowlist is optional - if empty, all businesses are allowed
 */
export function isBusinessAllowed(businessId: string): boolean {
  // If allowlist is empty or not set, skip allowlist check (allow all businesses)
  if (!AI_CONFIG.allowedBusinessIds || AI_CONFIG.allowedBusinessIds.length === 0) {
    console.log('[AI CALL ASSISTANT] Allowlist empty - skipping allowlist guard')
    return true
  }
  
  const allowed = AI_CONFIG.allowedBusinessIds.includes(businessId)
  
  if (!allowed) {
    console.log('[AI CALL ASSISTANT] Business not found in allowlist', {
      businessId,
      allowedCount: AI_CONFIG.allowedBusinessIds.length,
      allowedBusinessIds: AI_CONFIG.allowedBusinessIds
    })
  } else {
    console.log('[AI CALL ASSISTANT] Business found in allowlist', {
      businessId,
      allowedCount: AI_CONFIG.allowedBusinessIds.length
    })
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
export function isBusinessAIEnabled(business: { ai_assistant_enabled?: boolean | null; id?: string; onboarding_status?: string | null; provisioning_status?: string | null; forwarding_verified?: boolean | null }): boolean {
  const enabled = business.ai_assistant_enabled === true

  console.log('[AI FLAG CHECK]', {
    businessId: business.id || 'unknown',
    ai_assistant_enabled: business.ai_assistant_enabled,
    onboarding_status: business.onboarding_status || 'unknown',
    provisioning_status: business.provisioning_status || 'unknown',
    forwarding_verified: business.forwarding_verified || false,
    enabled
  })

  if (!enabled) {
    console.log('[AI CALL ASSISTANT] Guard failed: Business AI assistant not enabled', {
      businessId: business.id || 'unknown',
      ai_assistant_enabled: business.ai_assistant_enabled
    })
  } else {
    console.log('[AI CALL ASSISTANT] Guard passed: Business AI assistant enabled', {
      businessId: business.id || 'unknown',
      ai_assistant_enabled: business.ai_assistant_enabled
    })
  }

  return enabled
}

/**
 * Check all guards for AI assistant
 * Returns true if all guards pass
 */
export function checkAllGuards(businessId: string, business?: { ai_assistant_enabled?: boolean | null; onboarding_status?: string | null; provisioning_status?: string | null; forwarding_verified?: boolean | null }): { passed: boolean; reason: string } {
  console.log('[AI ROUTING DECISION]', {
    businessId,
    ai_assistant_enabled: business?.ai_assistant_enabled,
    onboarding_status: business?.onboarding_status,
    provisioning_status: business?.provisioning_status,
    forwarding_verified: business?.forwarding_verified,
  })

  console.log('[AI CALL ASSISTANT] Checking all guards...', { businessId })

  // Check 1: Global enable flag
  if (!isGloballyEnabled()) {
    console.log('[AI ROUTING DECISION] FAILED: not_globally_enabled')
    return { passed: false, reason: 'not_globally_enabled' }
  }

  // Check 2: Business allowlist
  if (!isBusinessAllowed(businessId)) {
    console.log('[AI ROUTING DECISION] FAILED: business_not_allowed')
    return { passed: false, reason: 'business_not_allowed' }
  }

  // Check 3: Business-level AI enabled flag
  if (business && !isBusinessAIEnabled(business)) {
    console.log('[AI ROUTING DECISION] FAILED: business_ai_not_enabled')
    return { passed: false, reason: 'business_ai_not_enabled' }
  }

  // Check 4: OpenAI configuration
  if (!isOpenAIConfigured()) {
    console.log('[AI ROUTING DECISION] FAILED: openai_not_configured')
    return { passed: false, reason: 'openai_not_configured' }
  }

  // Check 5: AI Voice WebSocket URL
  const aiVoiceWsUrl = process.env.AI_VOICE_FLY_WS_URL
  if (!aiVoiceWsUrl) {
    console.log('[AI CALL ASSISTANT] Guard failed: AI_VOICE_FLY_WS_URL not configured')
    console.log('[AI ROUTING DECISION] FAILED: ai_voice_ws_url_not_configured')
    return { passed: false, reason: 'ai_voice_ws_url_not_configured' }
  } else {
    console.log('[AI CALL ASSISTANT] Guard passed: AI_VOICE_FLY_WS_URL configured', { 
      wsUrl: aiVoiceWsUrl 
    })
  }

  console.log('[AI ROUTING DECISION] SUCCESS: All guards passed - routing to AI assistant')
  console.log('[AI ROUTING ACTIVE] All guards passed - routing to AI assistant')
  return { passed: true, reason: 'all_guards_passed' }
}
