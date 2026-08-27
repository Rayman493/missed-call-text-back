/**
 * Auth Capability Detection Helper
 *
 * Derives authentication capabilities from Supabase user object.
 * Uses canonical Supabase structures (user.identities, app_metadata)
 * rather than heuristics like email domains.
 *
 * REQUIRES RUNTIME VERIFICATION: This implementation is based on Supabase v2 documentation
 * and should be verified against actual production user objects.
 */

export interface AuthCapabilities {
  hasPassword: boolean
  oauthProviders: string[]
  hasGoogle: boolean
  hasApple: boolean
  hasMultipleMethods: boolean
  isPasswordOnly: boolean
  isOAuthOnly: boolean
  primaryProvider: string | null
}

/**
 * Derive auth capabilities from Supabase user object
 *
 * Priority order for provider detection:
 * 1. user.identities array (canonical source)
 * 2. app_metadata.providers array (fallback)
 * 3. app_metadata.provider (last resort, may be inaccurate for multi-method users)
 *
 * @param user - Supabase user object from getUser() or session
 * @returns AuthCapabilities object
 */
export function getAuthCapabilities(user: any): AuthCapabilities {
  // Defensive: Handle null/undefined user
  if (!user) {
    return {
      hasPassword: false,
      oauthProviders: [],
      hasGoogle: false,
      hasApple: false,
      hasMultipleMethods: false,
      isPasswordOnly: false,
      isOAuthOnly: false,
      primaryProvider: null,
    }
  }

  // Method 1: Check user.identities array (Supabase v2 canonical source)
  // This is the strongest available representation
  const identities = user.identities || []
  const identityProviders = identities
    .map((id: any) => id?.provider)
    .filter((p: unknown): p is string => !!p && typeof p === 'string')

  // Method 2: Fallback to app_metadata.providers (if available)
  const metadataProviders = user.app_metadata?.providers
  const metadataProviderArray = Array.isArray(metadataProviders)
    ? metadataProviders.filter((p): p is string => !!p && typeof p === 'string')
    : []

  // Method 3: Last resort: app_metadata.provider (may be inaccurate for multi-method)
  const primaryMetadataProvider = user.app_metadata?.provider || null

  // Merge and deduplicate providers
  const allProviders = new Set([...identityProviders, ...metadataProviderArray])
  if (primaryMetadataProvider && !allProviders.has(primaryMetadataProvider)) {
    allProviders.add(primaryMetadataProvider)
  }

  const providersArray = Array.from(allProviders)

  // Determine capabilities
  const hasPassword = providersArray.includes('email')
  const oauthProviders = providersArray.filter(p => p !== 'email')
  const hasGoogle = providersArray.includes('google')
  const hasApple = providersArray.includes('apple')
  const hasMultipleMethods = providersArray.length > 1

  // Determine primary provider
  // Prefer identity providers over metadata, but use metadata as fallback
  let primaryProvider: string | null = null
  if (identityProviders.length > 0) {
    // Use the first identity provider as primary
    primaryProvider = identityProviders[0]
  } else if (metadataProviderArray.length > 0) {
    primaryProvider = metadataProviderArray[0]
  } else if (primaryMetadataProvider) {
    primaryProvider = primaryMetadataProvider
  }

  // Classify user type
  const isPasswordOnly = hasPassword && !hasGoogle && !hasApple && oauthProviders.length === 0
  const isOAuthOnly = !hasPassword && (hasGoogle || hasApple || oauthProviders.length > 0)

  return {
    hasPassword,
    oauthProviders,
    hasGoogle,
    hasApple,
    hasMultipleMethods,
    isPasswordOnly,
    isOAuthOnly,
    primaryProvider,
  }
}

/**
 * Check if user can use password-based verification
 *
 * @param user - Supabase user object
 * @returns true if user has a password identity
 */
export function canUsePasswordVerification(user: any): boolean {
  const capabilities = getAuthCapabilities(user)
  return capabilities.hasPassword
}

/**
 * Check if user requires OAuth-only verification flow
 *
 * @param user - Supabase user object
 * @returns true if user is OAuth-only (no password)
 */
export function requiresOAuthVerification(user: any): boolean {
  const capabilities = getAuthCapabilities(user)
  return capabilities.isOAuthOnly
}