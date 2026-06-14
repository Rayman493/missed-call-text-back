/**
 * Admin-only visibility check
 * Used to gate internal tools and technical details from normal users
 */

/**
 * Get admin user IDs from environment variable
 * SECURITY: Only checks ADMIN_USER_IDS (server-side only)
 * Never check NEXT_PUBLIC_* variables as they would expose admin IDs to client bundle
 */
function getAdminUserIds(): string[] {
  const envVar = process.env.ADMIN_USER_IDS
  const adminIds = envVar?.split(',').map(id => id.trim()).filter(id => id.length > 0) || []

  return adminIds
}

/**
 * Check if a user is an admin by user ID
 * @param userId - User ID to check
 * @returns true if the user ID is in the admin list
 */
export function isAdminUserById(userId?: string | null): boolean {
  if (!userId) {
    return false
  }

  const adminIds = getAdminUserIds()
  return adminIds.includes(userId)
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
  return adminIds.includes(userId)
}
