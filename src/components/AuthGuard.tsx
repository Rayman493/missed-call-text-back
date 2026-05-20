'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useSearchParams } from 'next/navigation'
import SetupError from '@/components/SetupError'
import AppLoadingScreen from '@/components/AppLoadingScreen'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const searchParams = useSearchParams()

  // Check if we're in checkout recovery mode
  const isCheckoutRecovery = searchParams?.get('checkout') === 'success'

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  // RECOVERY MODE: When checkout=success, suppress all redirects
  // The centralized recovery flow in DashboardContent handles session restoration
  // AuthGuard simply shows loading during this time
  if (isCheckoutRecovery) {
    console.log('[AuthGuard] Recovery mode active - suppressing redirects, showing loading')
    return <AppLoadingScreen />
  }

  // Show loading during initial auth loading (not recovery mode)
  if (loading) {
    console.log('[AuthGuard] Showing loading state', { loading })
    return <AppLoadingScreen />
  }

  if (!user) {
    console.log('[AuthGuard] No user found, returning null (AuthProvider will handle redirect)')
    return null // Will redirect via AuthProvider
  }

  console.log('[AuthGuard] User authenticated, rendering children')
  return <>{children}</>
}
