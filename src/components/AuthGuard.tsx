'use client'

import { useAuth } from '@/contexts/AuthContext'
import SetupError from '@/components/SetupError'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-200">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect via AuthProvider
  }

  return <>{children}</>
}
