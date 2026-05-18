/**
 * Admin-only visibility check
 * Used to gate internal tools and technical details from normal users
 */

const ADMIN_ALLOWLIST = [
  'dragonmaster0102@gmail.com',
]

/**
 * Check if a user email is an admin
 * @param email - User email to check
 * @returns true if the email is in the admin allowlist
 */
export function isAdminUser(email?: string | null): boolean {
  if (!email) return false
  return ADMIN_ALLOWLIST.includes(email.toLowerCase().trim())
}
