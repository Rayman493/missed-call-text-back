import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Shared authentication helper for API routes
 * 
 * Supports both:
 * 1. Cookie-based SSR auth (browser)
 * 2. Bearer token auth (native Capacitor app)
 * 
 * Returns authenticated user or null
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[AUTH_HELPER] Missing Supabase environment variables')
    return null
  }

  // Try bearer token auth first (native Capacitor app)
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    console.log('[AUTH_HELPER] bearer_present=true')

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      console.error('[AUTH_HELPER] Bearer token validation failed:', error.message)
      return null
    }

    if (user) {
      console.log('[AUTH_HELPER] user_resolved=true via bearer token')
      return user
    }

    console.log('[AUTH_HELPER] Bearer token present but no user resolved')
    return null
  }

  // Fall back to cookie-based SSR auth (browser)
  console.log('[AUTH_HELPER] bearer_present=false, trying cookie auth')
  
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Read-only for auth check
        },
      },
    })

    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      console.error('[AUTH_HELPER] Cookie auth failed:', error.message)
      return null
    }

    if (user) {
      console.log('[AUTH_HELPER] user_resolved=true via cookie')
      return user
    }

    console.log('[AUTH_HELPER] No valid session found')
    return null
  } catch (error) {
    console.error('[AUTH_HELPER] Cookie auth error:', error)
    return null
  }
}
