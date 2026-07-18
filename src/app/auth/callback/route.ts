import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Safe redirect paths - prevent open redirect vulnerabilities
const SAFE_REDIRECT_PATHS = [
  '/',
  '/dashboard',
  '/onboarding',
  '/onboarding/new-onboarding',
  '/setup/forwarding',
  '/auth/signin'
]

function isValidRedirectPath(path: string): boolean {
  if (!path) return false
  // Check if path starts with / and is in our safe list
  return SAFE_REDIRECT_PATHS.some(safePath => path === safePath || path.startsWith(safePath + '/'))
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextParam = requestUrl.searchParams.get('next')
  
  // Validate and sanitize the next parameter
  const next = (nextParam && isValidRedirectPath(nextParam)) ? nextParam : null

  console.log('[ROUTING AUDIT DEBUG]', {
    location: 'auth/callback/route.ts',
    guardName: 'AuthCallback',
    currentPath: '/auth/callback',
    userId: 'checking...',
    sessionExists: 'checking...',
    authLoading: false,
    businessLoading: 'checking...',
    businessId: 'checking...',
    businessFound: 'checking...',
    twilioNumberFound: 'checking...',
    setupComplete: 'checking...',
    redirectTarget: next || '/onboarding',
    reason: 'Processing auth callback'
  })

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    try {
      await supabase.auth.exchangeCodeForSession(code)
      console.log('[Auth Callback] Auth session established successfully')
      
      // Get authenticated user to fetch their business
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        console.log('[ROUTING AUDIT DEBUG]', {
          location: 'auth/callback/route.ts',
          guardName: 'AuthCallback',
          currentPath: '/auth/callback',
          userId: user.id,
          sessionExists: true,
          authLoading: false,
          businessLoading: 'fetching...',
          businessId: 'fetching...',
          businessFound: 'fetching...',
          twilioNumberFound: 'fetching...',
          setupComplete: 'fetching...',
          redirectTarget: 'determining...',
          reason: 'Session established, checking business'
        })
        
        // Check if user has a business
        let business = null
        let businessError: any = null
        try {
          const { data, error } = await supabase
            .from('businesses')
            .select('id, twilio_phone_number, onboarding_status')
            .eq('user_id', user.id)
            .single()
          business = data
          businessError = error
        } catch (err) {
          businessError = err
        }
        
        // If business query fails, log error but don't assume no business
        if (businessError) {
          console.error('[Auth Callback] Business query error:', businessError)
          console.error('[Auth Callback] Error code:', businessError?.code)
          console.error('[Auth Callback] Error message:', businessError?.message)
          
          const isPGRST116 = businessError?.code === 'PGRST116'
          const redirectTarget = isPGRST116 ? '/onboarding' : '/dashboard'
          const reason = isPGRST116 ? 'No business row (PGRST116 confirmed)' : 'Business query error (non-PGRST116)'
          
          console.log('[POST LOGIN BUSINESS QUERY]', {
            location: 'src/app/auth/callback/route.ts',
            userId: user.id,
            sessionExists: true,
            businessFound: !!business,
            businessId: business?.id,
            errorCode: businessError?.code,
            errorMessage: businessError?.message,
            redirectTarget
          })
          
          console.log('[ONBOARDING REDIRECT SOURCE]', {
            file: 'src/app/auth/callback/route.ts',
            functionName: 'GET handler',
            currentPath: '/auth/callback',
            redirectTarget,
            userId: user.id,
            sessionExists: true,
            authLoading: false,
            businessLoading: 'complete',
            businessFetchComplete: true,
            businessId: null,
            businessFound: false,
            businessErrorCode: businessError?.code,
            businessErrorMessage: businessError?.message,
            reason,
            timestamp: new Date().toISOString()
          })
          console.trace('[ONBOARDING REDIRECT TRACE]')
          
          console.log('[ROUTING AUDIT DEBUG]', {
            location: 'auth/callback/route.ts',
            guardName: 'AuthCallback',
            currentPath: '/auth/callback',
            userId: user.id,
            sessionExists: true,
            authLoading: false,
            businessLoading: 'complete',
            businessId: null,
            businessFound: false,
            twilioNumberFound: null,
            setupComplete: null,
            redirectTarget,
            reason
          })
          
          return NextResponse.redirect(new URL(redirectTarget, requestUrl.origin))
        }
        
        const redirectTarget = business ? '/dashboard' : '/onboarding'
        const reason = business ? 'Business row exists' : 'No business row exists'
        
        console.log('[ONBOARDING REDIRECT SOURCE]', {
          file: 'src/app/auth/callback/route.ts',
          functionName: 'GET handler',
          currentPath: '/auth/callback',
          redirectTarget,
          userId: user.id,
          sessionExists: true,
          authLoading: false,
          businessLoading: 'complete',
          businessFetchComplete: true,
          businessId: business?.id,
          businessFound: !!business,
          businessErrorCode: null,
          businessErrorMessage: null,
          reason,
          timestamp: new Date().toISOString()
        })
        console.trace('[ONBOARDING REDIRECT TRACE]')
        
        console.log('[ROUTING AUDIT DEBUG]', {
          location: 'auth/callback/route.ts',
          guardName: 'AuthCallback',
          currentPath: '/auth/callback',
          userId: user.id,
          sessionExists: true,
          authLoading: false,
          businessLoading: 'complete',
          businessId: business?.id,
          businessFound: !!business,
          twilioNumberFound: !!business?.twilio_phone_number,
          setupComplete: business?.onboarding_status === 'completed',
          redirectTarget,
          reason
        })
        
        // Use the next parameter if provided and valid, otherwise use business-based routing
        const finalRedirect = next ? next : redirectTarget
        console.log('[Auth Callback] Redirecting to:', finalRedirect, {
          hasBusiness: !!business,
          businessId: business?.id,
          nextParam: next,
          finalRedirect
        })
        return NextResponse.redirect(new URL(finalRedirect, requestUrl.origin))
      }
    } catch (error) {
      console.error('[Auth Callback] Error establishing session:', error)
      // Fallback to signin if auth fails
      console.log('[ROUTING AUDIT DEBUG]', {
        location: 'auth/callback/route.ts',
        guardName: 'AuthCallback',
        currentPath: '/auth/callback',
        userId: null,
        sessionExists: false,
        authLoading: false,
        businessLoading: 'complete',
        businessId: null,
        businessFound: false,
        twilioNumberFound: false,
        setupComplete: false,
        redirectTarget: '/auth/signin?error=auth_failed',
        reason: 'Auth failed'
      })
      return NextResponse.redirect(new URL('/auth/signin?error=auth_failed', requestUrl.origin))
    }
  }

  console.log('[ROUTING AUDIT DEBUG]', {
    location: 'auth/callback/route.ts',
    guardName: 'AuthCallback',
    currentPath: '/auth/callback',
    userId: null,
    sessionExists: false,
    authLoading: false,
    businessLoading: 'complete',
    businessId: null,
    businessFound: false,
    twilioNumberFound: false,
    setupComplete: false,
    redirectTarget: next || '/auth/signin',
    reason: 'No code provided, using safe default'
  })
  
  // Safe default when no code provided
  console.log('[Auth Callback] Redirecting to:', next || '/auth/signin')
  return NextResponse.redirect(new URL(next || '/auth/signin', requestUrl.origin))
}
