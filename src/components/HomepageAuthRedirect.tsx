'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

export default function HomepageAuthRedirect() {
  const router = useRouter()
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true

    const checkRedirect = async () => {
      try {
        // Clear stale business cache so we don't use a cached verified status
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem('replyflow_business_verified')
            localStorage.removeItem('replyflow_business_verified')
          } catch (e) {
            console.error('[HomepageAuthRedirect] Error clearing cache:', e)
          }
        }

        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          // Not signed in - stay on homepage, no loading state needed
          if (mounted) setIsSignedIn(false)
          return
        }

        if (mounted) setIsSignedIn(true)

        // Fetch the user's business row
        const { data: business, error: businessError } = await supabase
          .from('businesses')
          .select('id, subscription_status')
          .eq('user_id', session.user.id)
          .limit(1)
          .maybeSingle()

        if (businessError) {
          console.error('[HomepageAuthRedirect] Error fetching business:', businessError)
          if (mounted) setIsSignedIn(false)
          return
        }

        if (!business) {
          // No business found - let onboarding guard handle this
          if (mounted) setIsSignedIn(false)
          return
        }

        if (business.subscription_status === null) {
          // Incomplete signup - redirect to complete-setup
          console.log('[HomepageAuthRedirect] Incomplete signup detected, redirecting to /complete-setup')
          router.replace('/complete-setup')
          return
        }

        // Trialing/active user - stay on homepage
        if (mounted) setIsSignedIn(false)
      } catch (err) {
        console.error('[HomepageAuthRedirect] Unexpected error:', err)
        if (mounted) setIsSignedIn(false)
      }
    }

    checkRedirect()

    return () => {
      mounted = false
    }
  }, [router])

  // Only show loading state while checking a signed-in user
  if (isSignedIn !== true) return null

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 border-solid rounded-full animate-spin"></div>
    </div>
  )
}
