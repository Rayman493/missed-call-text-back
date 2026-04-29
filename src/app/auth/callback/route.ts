import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/onboarding'

  console.log('[Auth Callback] Processing auth callback:', { 
    hasCode: !!code, 
    nextUrl: next,
    userAgent: request.headers.get('user-agent')
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
    } catch (error) {
      console.error('[Auth Callback] Error establishing session:', error)
      // Fallback to onboarding if auth fails
      return NextResponse.redirect(new URL('/onboarding?error=auth_failed', requestUrl.origin))
    }
  }

  console.log('[Auth Callback] Redirecting to:', next)
  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
