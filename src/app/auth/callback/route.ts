import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/onboarding'

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
    redirectTarget: next,
    reason: 'Processing auth callback'
  })

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )

    try {
      await supabase.auth.exchangeCodeForSession(code)
      console.log('[Auth Callback] Auth session established successfully')
      
      // Get the user's session to fetch their business
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        console.log('[ROUTING AUDIT DEBUG]', {
          location: 'auth/callback/route.ts',
          guardName: 'AuthCallback',
          currentPath: '/auth/callback',
          userId: session.user.id,
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
        const { data: business } = await supabase
          .from('businesses')
          .select('id, twilio_phone_number, onboarding_status')
          .eq('user_id', session.user.id)
          .single()
        
        const redirectTarget = business ? '/dashboard' : '/onboarding'
        const reason = business ? 'Business row exists' : 'No business row exists'
        
        console.log('[ROUTING AUDIT DEBUG]', {
          location: 'auth/callback/route.ts',
          guardName: 'AuthCallback',
          currentPath: '/auth/callback',
          userId: session.user.id,
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
        
        // Use the next parameter if provided, otherwise use business-based routing
        const finalRedirect = next !== '/onboarding' ? next : redirectTarget
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
      // Fallback to onboarding if auth fails
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
        redirectTarget: '/onboarding?error=auth_failed',
        reason: 'Auth failed'
      })
      return NextResponse.redirect(new URL('/onboarding?error=auth_failed', requestUrl.origin))
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
    redirectTarget: next,
    reason: 'No code provided, using next parameter'
  })
  
  console.log('[Auth Callback] Redirecting to:', next)
  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
