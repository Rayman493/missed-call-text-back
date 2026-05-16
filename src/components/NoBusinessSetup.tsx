'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NoBusinessSetup() {
  console.log('[NoBusinessSetup] Rendering component')

  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  // Add mobile detection
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  console.log('[Mobile New User Branch]', {
    isMobile,
    userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'server',
    viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'server'
  })

  // Hooks at top level - no conditional hooks
  useEffect(() => {
    console.log('[NoBusinessSetup] Component mounted, redirecting to onboarding')
    console.log('[rendering NoBusinessSetup]')
    setIsLoading(false)
    
    // Small delay to ensure client-side redirect works on mobile
    const timer = setTimeout(() => {
      console.log('[NoBusinessSetup] Redirecting to /onboarding')
      router.push('/onboarding')
    }, 100)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Welcome to ReplyFlow
        </h2>
        <p className="text-muted-foreground mb-6">
          Setting up your account...
        </p>
        {isLoading && (
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto"></div>
        )}
      </div>
    </div>
  )
}
