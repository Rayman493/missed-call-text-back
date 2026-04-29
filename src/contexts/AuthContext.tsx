'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

interface AuthContextType {
  session: any
  loading: boolean
  user: any
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const authSubscriptionRef = useRef<any>(null)

  useEffect(() => {
    // Restore session on app load
    const restoreSession = async () => {
      console.log('[Auth] Restoring session...')
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('[Auth] Session restore error:', error)
        }
        
        if (session) {
          console.log('[Auth] Session restored:', session.user.id)
          setSession(session)
          setUser(session.user)
        } else {
          console.log('[Auth] No session found')
        }
      } catch (error) {
        console.error('[Auth] Session restore failed:', error)
      } finally {
        setLoading(false)
      }
    }

    restoreSession()

    // Listen to auth state changes - only once
    if (!authSubscriptionRef.current && supabase) {
      authSubscriptionRef.current = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        console.log('[Auth] Auth state changed:', _event, session?.user?.id)
        
        if (session) {
          setSession(session)
          setUser(session.user)
        } else {
          setSession(null)
          setUser(null)
        }
      })
    }

    return () => {
      console.log('[Auth] Cleaning up auth subscription')
      if (authSubscriptionRef.current?.subscription) {
        try {
          authSubscriptionRef.current.subscription.unsubscribe()
          console.log('[Auth] Auth subscription cleaned up successfully')
        } catch (error) {
          console.error('[Auth] Error cleaning up auth subscription:', error)
        }
        authSubscriptionRef.current = null
      }
    }
  }, [])

  // Handle routing based on auth state
  useEffect(() => {
    if (loading) return

    // If user is NOT authenticated and on dashboard or onboarding, redirect to homepage
    if (!user && (pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding'))) {
      console.log('[Auth] Redirecting to homepage (unauthenticated user on protected route)')
      router.push('/')
    }
  }, [user, loading, pathname, router])

  // Sign out function that clears all sensitive data
  const signOut = async () => {
    console.log('[Auth] Signing out and clearing sensitive data')
    
    try {
      // Clear any credential-related form data from session storage
      if (typeof window !== 'undefined') {
        // Clear any form data that might contain sensitive information
        const keysToRemove = []
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key && (key.includes('credential') || key.includes('token') || key.includes('secret') || key.includes('key') || key.includes('auth') || key.includes('email') || key.includes('password'))) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(key => sessionStorage.removeItem(key))
        
        // Clear any credential-related form data from localStorage
        const localKeysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('credential') || key.includes('token') || key.includes('secret') || key.includes('key') || key.includes('auth') || key.includes('email') || key.includes('password'))) {
            localKeysToRemove.push(key)
          }
        }
        localKeysToRemove.forEach(key => localStorage.removeItem(key))
      }
      
      // Sign out from Supabase
      await supabase.auth.signOut()
      
      // Clear auth state
      setSession(null)
      setUser(null)
      
      // Redirect to home
      router.push('/')
    } catch (error) {
      console.error('[Auth] Sign out error:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ session, loading, user, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
