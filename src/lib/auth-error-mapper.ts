/**
 * Canonical Authentication Error Mapper
 * 
 * Maps provider errors into customer-facing categories with polished copy.
 * Never exposes raw backend error messages to users.
 */

export interface AuthErrorDisplay {
  heading: string
  body: string
  category: 'invalid_credentials' | 'email_not_confirmed' | 'rate_limited' | 'network_failure' | 'unknown'
}

/**
 * Maps Supabase/auth provider errors to customer-friendly messages
 */
export function mapAuthError(error: any): AuthErrorDisplay {
  const errorMessage = error?.message || String(error).toLowerCase()

  // Invalid credentials (email/password mismatch)
  if (
    errorMessage.includes('invalid login credentials') ||
    errorMessage.includes('invalid credentials') ||
    errorMessage.includes('invalid password') ||
    errorMessage.includes('email not found') ||
    errorMessage.includes('user not found') ||
    errorMessage.includes('authapierror')
  ) {
    return {
      heading: "We couldn't sign you in",
      body: "The email or password you entered doesn't match our records. Check your information and try again.",
      category: 'invalid_credentials',
    }
  }

  // Email not confirmed
  if (
    errorMessage.includes('email not confirmed') ||
    errorMessage.includes('confirm your email') ||
    errorMessage.includes('email confirmation')
  ) {
    return {
      heading: "Confirm your email",
      body: "Check your inbox and confirm your email address before signing in.",
      category: 'email_not_confirmed',
    }
  }

  // Rate limited
  if (
    errorMessage.includes('too many requests') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many attempts') ||
    errorMessage.includes('try again later')
  ) {
    return {
      heading: "Too many attempts",
      body: "Please wait a moment before trying again.",
      category: 'rate_limited',
    }
  }

  // Network/server failure
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('502') ||
    errorMessage.includes('503') ||
    errorMessage.includes('504')
  ) {
    return {
      heading: "Sign-in is temporarily unavailable",
      body: "Please check your connection and try again.",
      category: 'network_failure',
    }
  }

  // Unknown error - safe fallback
  return {
    heading: "Something went wrong",
    body: "We couldn't sign you in. Please try again.",
    category: 'unknown',
  }
}
