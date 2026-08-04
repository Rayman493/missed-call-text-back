/**
 * Production Environment Validation Helper
 * 
 * Centralized validation for required environment variables.
 * Verifies configuration exists, produces clear diagnostics, never logs secrets.
 * 
 * Usage:
 * import { validateEnvironment, getEnvironmentDiagnostics } from '@/lib/env-validation'
 * 
 * const validation = validateEnvironment()
 * if (!validation.valid) {
 *   console.error('[ENV] Configuration errors:', validation.errors)
 *   console.warn('[ENV] Configuration warnings:', validation.warnings)
 * }
 */

export interface EnvVarConfig {
  name: string
  description: string
  required: boolean
  category: 'supabase' | 'twilio' | 'stripe' | 'ai' | 'calendar' | 'push' | 'cron' | 'admin' | 'email' | 'system'
  fallback?: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  missing: string[]
  optionalMissing: string[]
}

const ENV_VARIABLES: EnvVarConfig[] = [
  // Supabase
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    description: 'Supabase project URL',
    required: true,
    category: 'supabase',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    description: 'Supabase anonymous key',
    required: true,
    category: 'supabase',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    description: 'Supabase service role key (for server operations)',
    required: true,
    category: 'supabase',
  },
  
  // Twilio
  {
    name: 'TWILIO_ACCOUNT_SID',
    description: 'Twilio Account SID',
    required: true,
    category: 'twilio',
  },
  {
    name: 'TWILIO_AUTH_TOKEN',
    description: 'Twilio Auth Token',
    required: true,
    category: 'twilio',
  },
  {
    name: 'TWILIO_MESSAGING_SERVICE_SID',
    description: 'Twilio Messaging Service SID',
    required: false,
    category: 'twilio',
  },
  {
    name: 'REPLYFLOW_SYSTEM_SMS_NUMBER',
    description: 'ReplyFlow system SMS number',
    required: false,
    category: 'twilio',
  },
  {
    name: 'PROTECTED_TWILIO_NUMBERS',
    description: 'Comma-separated list of protected Twilio numbers',
    required: false,
    category: 'twilio',
    fallback: '',
  },
  
  // Stripe
  {
    name: 'STRIPE_SECRET_KEY',
    description: 'Stripe API secret key',
    required: true,
    category: 'stripe',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    description: 'Stripe webhook signing secret',
    required: true,
    category: 'stripe',
  },
  
  // AI Services
  {
    name: 'OPENAI_API_KEY',
    description: 'OpenAI API key for AI assistant',
    required: true,
    category: 'ai',
  },
  {
    name: 'OPENAI_BASE_URL',
    description: 'OpenAI API base URL',
    required: false,
    category: 'ai',
    fallback: 'https://api.openai.com/v1',
  },
  {
    name: 'AI_VOICE_FLY_WS_URL',
    description: 'AI voice WebSocket URL',
    required: false,
    category: 'ai',
  },
  {
    name: 'AI_MAX_CALL_SECONDS',
    description: 'Maximum AI call duration in seconds',
    required: false,
    category: 'ai',
    fallback: '300',
  },
  {
    name: 'AI_MAX_CONVERSATION_TURNS',
    description: 'Maximum AI conversation turns',
    required: false,
    category: 'ai',
    fallback: '20',
  },
  {
    name: 'AI_MAX_FIELD_ATTEMPTS',
    description: 'Maximum AI field extraction attempts',
    required: false,
    category: 'ai',
    fallback: '3',
  },
  
  // System
  {
    name: 'NEXT_PUBLIC_APP_URL',
    description: 'Application URL',
    required: true,
    category: 'system',
    fallback: process.env.VERCEL_URL || 'https://replyflowhq.com',
  },
  {
    name: 'VERCEL_URL',
    description: 'Vercel deployment URL',
    required: false,
    category: 'system',
  },
  
  // Cron
  {
    name: 'CRON_SECRET',
    description: 'Secret for cron job authentication',
    required: true,
    category: 'cron',
  },
  
  // Admin
  {
    name: 'ADMIN_SECRET',
    description: 'Secret for admin operations',
    required: false,
    category: 'admin',
  },
  {
    name: 'ADMIN_USER_IDS',
    description: 'Comma-separated list of admin user IDs',
    required: false,
    category: 'admin',
    fallback: '',
  },
  {
    name: 'PROVISIONING_ADMIN_SECRET',
    description: 'Secret for provisioning operations',
    required: false,
    category: 'admin',
  },
  {
    name: 'INTERNAL_API_SECRET',
    description: 'Secret for internal API calls',
    required: false,
    category: 'admin',
  },
  
  // Email
  {
    name: 'RESEND_API_KEY',
    description: 'Resend API key for email sending',
    required: false,
    category: 'email',
  },
  {
    name: 'RESEND_FROM_EMAIL',
    description: 'From email for Resend',
    required: false,
    category: 'email',
    fallback: 'ReplyFlow <noreply@replyflowhq.com>',
  },
  {
    name: 'FOUNDER_ALERT_EMAIL',
    description: 'Email for founder alerts',
    required: false,
    category: 'email',
  },
  
  // Warm Inventory
  {
    name: 'WARM_INVENTORY_TARGET',
    description: 'Target warm number inventory count',
    required: false,
    category: 'twilio',
    fallback: '3',
  },
  
  // Twilio Cleanup
  {
    name: 'TWILIO_RETIRED_CLEANUP_ENABLED',
    description: 'Enable Twilio retired number cleanup',
    required: false,
    category: 'twilio',
    fallback: 'false',
  },
  {
    name: 'TWILIO_RETIRED_QUARANTINE_DAYS',
    description: 'Quarantine period for retired numbers',
    required: false,
    category: 'twilio',
    fallback: '30',
  },
  {
    name: 'TWILIO_RETIRED_CLEANUP_MAX_ATTEMPTS',
    description: 'Max attempts for number release',
    required: false,
    category: 'twilio',
    fallback: '5',
  },
  
  // Firebase (Push Notifications)
  {
    name: 'FIREBASE_PROJECT_ID',
    description: 'Firebase project ID for push notifications',
    required: false,
    category: 'push',
  },
  {
    name: 'FIREBASE_CLIENT_EMAIL',
    description: 'Firebase client email',
    required: false,
    category: 'push',
  },
  {
    name: 'FIREBASE_PRIVATE_KEY',
    description: 'Firebase private key',
    required: false,
    category: 'push',
  },
]

/**
 * Validate environment variables
 * Returns validation result with errors and warnings
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const missing: string[] = []
  const optionalMissing: string[] = []
  
  for (const config of ENV_VARIABLES) {
    const value = process.env[config.name]
    const hasValue = value !== undefined && value !== null && value !== ''
    
    if (config.required && !hasValue) {
      const error = `[${config.category.toUpperCase()}] Missing required: ${config.name} (${config.description})`
      errors.push(error)
      missing.push(config.name)
    } else if (!config.required && !hasValue && config.fallback === undefined) {
      const warning = `[${config.category.toUpperCase()}] Missing optional: ${config.name} (${config.description})`
      warnings.push(warning)
      optionalMissing.push(config.name)
    }
  }
  
  const valid = errors.length === 0
  
  return {
    valid,
    errors,
    warnings,
    missing,
    optionalMissing,
  }
}

/**
 * Get environment diagnostics as a formatted string
 * Useful for health checks and startup logging
 */
export function getEnvironmentDiagnostics(): string {
  const validation = validateEnvironment()
  
  const lines: string[] = []
  
  lines.push('=== Environment Configuration Diagnostics ===')
  lines.push(`Status: ${validation.valid ? 'VALID' : 'INVALID'}`)
  lines.push('')
  
  if (validation.errors.length > 0) {
    lines.push('ERRORS (Critical):')
    validation.errors.forEach(error => lines.push(`  ✗ ${error}`))
    lines.push('')
  }
  
  if (validation.warnings.length > 0) {
    lines.push('WARNINGS (Optional):')
    validation.warnings.forEach(warning => lines.push(`  ⚠ ${warning}`))
    lines.push('')
  }
  
  if (validation.valid) {
    lines.push('All required environment variables are configured.')
  } else {
    lines.push(`${validation.errors.length} required configuration(s) missing.`)
  }
  
  lines.push('==========================================')
  
  return lines.join('\n')
}

/**
 * Validate a specific environment variable
 * Returns whether it exists and is non-empty
 */
export function validateEnvVar(name: string): boolean {
  const value = process.env[name]
  return value !== undefined && value !== null && value !== ''
}

/**
 * Get a safe version of environment diagnostics (no secret values)
 * For logging purposes only
 */
export function getSafeEnvironmentReport(): {
  categories: Record<string, { configured: number; total: number; missing: string[] }>
  overallStatus: 'valid' | 'invalid'
} {
  const validation = validateEnvironment()
  
  const categories: Record<string, { configured: number; total: number; missing: string[] }> = {}
  
  // Initialize categories
  ENV_VARIABLES.forEach(config => {
    if (!categories[config.category]) {
      categories[config.category] = { configured: 0, total: 0, missing: [] }
    }
    categories[config.category].total++
    
    const hasValue = validateEnvVar(config.name)
    if (hasValue) {
      categories[config.category].configured++
    } else if (config.required) {
      categories[config.category].missing.push(config.name)
    }
  })
  
  return {
    categories,
    overallStatus: validation.valid ? 'valid' : 'invalid',
  }
}
