'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

interface AuthContextType {
  session: any
  loading: boolean
  user: any
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

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

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      console.log('[Auth] Auth state changed:', _event, session?.user?.id)
      
      if (session) {
        setSession(session)
        setUser(session.user)
      } else {
        setSession(null)
        setUser(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Handle routing based on auth state
  useEffect(() => {
    if (loading) return

    // If user is authenticated and on root home page, redirect to dashboard
    // But allow /home for logged-in users to view the landing page
    if (user && pathname === '/') {
      console.log('[Auth] Redirecting to dashboard')
      router.push('/dashboard')
    }

    // If user is NOT authenticated and on dashboard, redirect to auth
    if (!user && pathname?.startsWith('/dashboard')) {
      console.log('[Auth] Redirecting to login')
      router.push('/auth?mode=signin')
    }
  }, [user, loading, pathname, router])

  return (
    <AuthContext.Provider value={{ session, loading, user }}>
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
