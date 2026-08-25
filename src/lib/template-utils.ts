/**
 * Template Utility Functions
 * 
 * Shared utilities for template normalization and safe business name resolution.
 * Used in both client (Settings) and server (follow-up sending) contexts.
 */

/**
 * Normalize broken template patterns that were generated with invalid placeholders.
 * 
 * @param message - The message to normalize
 * @returns The normalized message with known broken patterns replaced
 */
export function normalizeBrokenTemplates(message: string | null | undefined): string {
  if (!message) return ''
  let normalized = message
    .replace(/from undefined/g, 'from our team')
    .replace(/from null/g, 'from our team')
    .replace(/this is undefined/g, 'this is our team')
    .replace(/this is null/g, 'this is our team')
    .replace(/Final follow-up from undefined/g, 'Final follow-up from our team')
    .replace(/Final follow-up from null/g, 'Final follow-up from our team')
  return normalized
}

/**
 * Get a safe business name for use in templates.
 * 
 * Rejects literal "undefined"/"null" strings and empty values.
 * Falls back to "our team" if no valid name is available.
 * 
 * @param formBusinessName - Business name from form input
 * @param businessName - Business name from database
 * @returns A safe business name
 */
export function getSafeBusinessName(formBusinessName: string | null | undefined, businessName: string | null | undefined): string {
  const name1 = formBusinessName?.trim()
  const name2 = businessName?.trim()

  // Check for literal "undefined" string or empty/whitespace values
  const isValidName = (name: string | null | undefined) => {
    if (!name) return false
    const trimmed = name.trim()
    if (trimmed.length === 0) return false
    if (trimmed === 'undefined' || trimmed === 'null') return false
    return true
  }

  if (isValidName(name1)) {
    return name1!
  }
  if (isValidName(name2)) {
    return name2!
  }
  return 'our team'
}

/**
 * Substitute template placeholders with actual values.
 * 
 * @param template - The template string with placeholders like {{business_name}}
 * @param businessName - The business name to use for {{business_name}}
 * @param returnDate - Optional return date for {{return_date}}
 * @returns The template with placeholders replaced
 */
export function substituteTemplatePlaceholders(
  template: string,
  businessName: string | null | undefined,
  returnDate?: string | null | undefined
): string {
  let result = template

  // Substitute {{business_name}} with safe business name
  const safeName = getSafeBusinessName(null, businessName)
  result = result.replace(/\{\{business_name\}\}/g, safeName)

  // Substitute {{return_date}} if provided
  if (returnDate) {
    result = result.replace(/\{\{return_date\}\}/g, returnDate)
  } else {
    // If return_date is missing, remove the placeholder entirely
    result = result.replace(/\{\{return_date\}\}/g, '')
  }

  return result
}