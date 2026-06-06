/**
 * Admin-only visibility check
 * Used to gate internal tools and technical details from normal users
 */

/**
 * Get admin user IDs from environment variable
 * Falls back to development mode check if not configured
 */
function getAdminUserIds(): string[] {
  const envVar = process.env.ADMIN_USER_IDS || process.env.NEXT_PUBLIC_ADMIN_USER_IDS
  const adminIds = envVar?.split(',').map(id => id.trim()).filter(id => id.length > 0) || []
  
  console.log('[ADMIN CHECK] Admin user IDs from environment:', {
    envVar,
    adminIds,
    count: adminIds.length
  })
  
  return adminIds
}

/**
 * Check if the current environment allows admin tools
 * Development environments allow admin tools for debugging
 */
function isDevelopmentEnvironment(): boolean {
  if (typeof window === 'undefined') {
    // Server-side: check environment variable
    return process.env.NODE_ENV === 'development' || (process.env.NEXT_PUBLIC_APP_URL?.includes('localhost') ?? false)
  }
  // Client-side: check if we're in development
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

/**
 * Check if a user is an admin by user ID
 * @param userId - User ID to check
 * @returns true if the user ID is in the admin list
 */
export function isAdminUserById(userId?: string | null): boolean {
  // Allow admin tools in development environment
  if (isDevelopmentEnvironment()) {
    console.log('[ADMIN CHECK] Development environment - allowing admin access')
    return true
  }
  
  if (!userId) {
    console.log('[ADMIN CHECK] No user ID provided')
    return false
  }
  
  const adminIds = getAdminUserIds()
  const isAdmin = adminIds.includes(userId)
  
  console.log('[ADMIN CHECK] Admin check by user ID:', {
    userId,
    adminIds,
    isAdmin
  })
  
  return isAdmin
}

/**
 * Check if a user is an admin by email (deprecated, use isAdminUserById)
 * @param email - User email to check
 * @returns true if the email is in the admin allowlist
 */
export function isAdminUser(email?: string | null): boolean {
  // Allow admin tools in development environment
  if (isDevelopmentEnvironment()) {
    console.log('[ADMIN CHECK] Development environment - allowing admin access')
    return true
  }
  
  if (!email) {
    console.log('[ADMIN CHECK] No email provided')
    return false
  }
  
  // Deprecated: This checks hardcoded email list
  // Use isAdminUserById instead for environment variable-based admin check
  const ADMIN_ALLOWLIST = [
    'dragonmaster0102@gmail.com',
  ]
  
  const isAdmin = ADMIN_ALLOWLIST.includes(email.toLowerCase().trim())
  
  console.log('[ADMIN CHECK] Admin check by email (deprecated):', {
    email,
    isAdmin
  })
  
  return isAdmin
}

/**
 * Check if user is an internal admin (not just dev environment)
 * This is for more sensitive operations that should only work for actual admins
 * @param userId - User ID to check
 * @returns true if the user ID is in the admin list
 */
export function isInternalAdmin(userId?: string | null): boolean {
  if (!userId) return false
  
  const adminIds = getAdminUserIds()
  return adminIds.includes(userId)
}

/**
 * Server-side admin check for API routes
 * This is the canonical admin check for all API routes
 * Uses ADMIN_USER_IDS environment variable and checks by user ID
 * @param userId - User ID to check
 * @returns true if the user ID is in the admin list
 */
export function isAdmin(userId?: string | null): boolean {
  if (!userId) return false
  
  const adminIds = getAdminUserIds()
  const isAdmin = adminIds.includes(userId)
  
  console.log('[ADMIN API AUTH]', {
    userId,
    adminIds,
    isAdmin
  })
  
  return isAdmin
}
