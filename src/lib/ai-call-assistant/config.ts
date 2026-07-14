/**
 * AI Call Assistant Configuration
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
    
    // Treat 'true' or 'false' as blank (these are likely boolean coercion issues)
    if (raw === '' || raw === 'true' || raw === 'false') {
      return []
    }
    
    const allowedBusinessIds = raw
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
    
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
  
  // Voice activity and endpointing configuration
  // Note: Actual endpointing parameters are configured in the external AI Voice service (Fly.io)
  // These values document the intended behavior for reference
  voiceActivity: {
    // Conservative endpointing to allow callers to pause naturally
    // Old: 800ms (more aggressive, could cut off thinking callers)
    // New: 1200ms (allows brief pauses while thinking)
    endpointingPrewarmDurationMs: 1200,
    
    // Silence detection before considering speech complete
    // Old: 600ms
    // New: 900ms (slightly more patient)
    silenceDurationMs: 900,
  },
  
  // Turn-to-turn pacing configuration
  // Note: Actual pacing is controlled by the external AI Voice service (Fly.io)
  // These values document the intended behavior for reference
  pacing: {
    // Delay between caller speech end and AI response start
    // Old: 200ms (could feel impatient)
    // New: 300ms (slightly more natural, not noticeably slower)
    responseDelayMs: 300,
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
  return enabled
}

/**
 * Check if a business is allowed to use AI assistant
 * Allowlist is optional - if empty, all businesses are allowed
 */
export function isBusinessAllowed(businessId: string): boolean {
  // If allowlist is empty or not set, skip allowlist check (allow all businesses)
  if (!AI_CONFIG.allowedBusinessIds || AI_CONFIG.allowedBusinessIds.length === 0) {
    return true
  }
  
  const allowed = AI_CONFIG.allowedBusinessIds.includes(businessId)
  return allowed
}

/**
 * Check if OpenAI API key is configured
 */
export function isOpenAIConfigured(): boolean {
  const configured = !!AI_CONFIG.openai.apiKey
  return configured
}

/**
 * Check all guards for AI assistant
 * Returns true if all guards pass
 *
 * V1 canonical logic: AI is attempted for every eligible business.
 * The per-business ai_assistant_enabled flag has been removed — the UI toggle
 * no longer exists and the DB column defaults false. Legitimate skip conditions
 * are: global env flags not set, OpenAI key missing, or Fly WebSocket URL missing.
 */
export function checkAllGuards(businessId: string, business?: { onboarding_status?: string | null; provisioning_status?: string | null; forwarding_verified?: boolean | null }): { passed: boolean; reason: string } {
  // Check 1: Global enable flag
  if (!isGloballyEnabled()) {
    return { passed: false, reason: 'not_globally_enabled' }
  }

  // Check 2: Business allowlist
  if (!isBusinessAllowed(businessId)) {
    return { passed: false, reason: 'business_not_allowed' }
  }

  // Check 3: OpenAI configuration
  if (!isOpenAIConfigured()) {
    return { passed: false, reason: 'openai_not_configured' }
  }

  // Check 4: AI Voice WebSocket URL
  const aiVoiceWsUrl = process.env.AI_VOICE_FLY_WS_URL
  if (!aiVoiceWsUrl) {
    console.error('[AI VOICE CONFIG ERROR] AI_VOICE_FLY_WS_URL is not configured. AI Voice cannot function without Fly.io WebSocket URL.', {
      fix: 'Set AI_VOICE_FLY_WS_URL environment variable to the Fly.io WebSocket endpoint (e.g., wss://replyflow-ai-voice.fly.dev/stream)'
    })
    return { passed: false, reason: 'ai_voice_ws_url_not_configured' }
  }

  return { passed: true, reason: 'all_guards_passed' }
}
