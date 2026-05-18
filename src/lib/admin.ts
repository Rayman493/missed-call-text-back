/**
 * Admin-only visibility check
 * Used to gate internal tools and technical details from normal users
 */

const ADMIN_ALLOWLIST = [
  'dragonmaster0102@gmail.com',
]

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
 * Check if a user email is an admin
 * @param email - User email to check
 * @returns true if the email is in the admin allowlist
 */
export function isAdminUser(email?: string | null): boolean {
  // Allow admin tools in development environment
  if (isDevelopmentEnvironment()) {
    return true
  }
  
  if (!email) return false
  return ADMIN_ALLOWLIST.includes(email.toLowerCase().trim())
}

/**
 * Check if user is an internal admin (not just dev environment)
 * This is for more sensitive operations that should only work for actual admins
 * @param email - User email to check
 * @returns true if the email is in the admin allowlist
 */
export function isInternalAdmin(email?: string | null): boolean {
  if (!email) return false
  return ADMIN_ALLOWLIST.includes(email.toLowerCase().trim())
}
