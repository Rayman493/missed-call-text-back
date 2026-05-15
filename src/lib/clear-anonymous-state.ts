/**
 * Clear ReplyFlow-related local state for anonymous users
 * This prevents stale localStorage/sessionStorage from causing bad routing
 */

export function clearAnonymousAppState(): { clearedKeys: string[] } {
  const clearedKeys: string[] = []

  // Keys to clear (ReplyFlow-related, NOT Supabase auth keys)
  const keysToClear = [
    'onboarding',
    'business',
    'setup',
    'dashboard',
    'checkout',
    'signup',
    'trial',
    'redirect',
    'replyflow',
    'businessId',
    'business_name',
    'business_phone',
    'onboarding_status',
    'forwarding_verified',
    'subscription_status',
    'trial_active',
    'checkout_success',
    'signup_completed',
    'redirectToOnboarding',
    'pendingOnboarding',
    'businessSetupPending',
  ]

  // Clear localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    const localStorageKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        localStorageKeys.push(key)
      }
    }

    localStorageKeys.forEach(key => {
      const keyLower = key.toLowerCase()
      const shouldClear = keysToClear.some(keyword => 
        keyLower.includes(keyword.toLowerCase())
      )
      
      if (shouldClear) {
        localStorage.removeItem(key)
        clearedKeys.push(`localStorage:${key}`)
      }
    })
  }

  // Clear sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const sessionStorageKeys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key) {
        sessionStorageKeys.push(key)
      }
    }

    sessionStorageKeys.forEach(key => {
      const keyLower = key.toLowerCase()
      const shouldClear = keysToClear.some(keyword => 
        keyLower.includes(keyword.toLowerCase())
      )
      
      if (shouldClear) {
        sessionStorage.removeItem(key)
        clearedKeys.push(`sessionStorage:${key}`)
      }
    })
  }

  console.log('[Anonymous State Cleanup] Cleared keys:', clearedKeys)
  
  return { clearedKeys }
}
