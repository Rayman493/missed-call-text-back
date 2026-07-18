import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const pathname = req.nextUrl.pathname
  const search = req.nextUrl.search

  // Trace log at middleware entry
  const url = new URL(req.url)
  const checkoutParam = url.searchParams.get('checkout')
  const sessionId = url.searchParams.get('session_id')
  const billingReturnParam = url.searchParams.get('billing_return')
  const hasCheckoutSuccess =
    checkoutParam === 'success' ||
    Boolean(sessionId?.startsWith('cs_'))

  // Check for billing return requests - these should bypass auth redirects
  const isBillingReturn = billingReturnParam === 'success'
  const hasStripeSession = Boolean(sessionId?.startsWith('cs_'))

  const isMobile = req.headers.get('user-agent') ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(req.headers.get('user-agent')!) : false

  console.log('[MIDDLEWARE ENTRY]', {
    pathname,
    search,
    hasCheckoutSuccess,
    isBillingReturn,
    hasStripeSession,
    hasSession: false, // Will be updated after session check
    userAgent: req.headers.get('user-agent'),
    isMobile,
    timestamp: new Date().toISOString()
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Get authenticated user for secure identity verification
  let user: any = null
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    user = authUser
  } catch (error: any) {
    // Handle stale refresh token errors gracefully
    if (error?.message?.includes('refresh_token_not_found') || error?.message?.includes('Refresh Token Not Found')) {
      console.log('[MIDDLEWARE] Stale refresh token detected, clearing auth cookies')
      // Clear auth cookies by setting them to expire
      res.cookies.delete('sb-access-token')
      res.cookies.delete('sb-refresh-token')
    } else {
      console.error('[MIDDLEWARE] Session check error:', error)
    }
  }

  console.log('[MIDDLEWARE SESSION CHECK]', {
    from: pathname + search,
    hasUser: !!user,
    userId: user?.id,
    method: req.method,
    hasCheckoutSuccess,
    isMobile,
    timestamp: new Date().toISOString()
  })

  console.log('[MIDDLEWARE REQUEST ANALYSIS]', {
    pathname,
    hasUser: !!user,
    method: req.method,
    hasCheckoutSuccess,
    isBillingReturn,
    hasStripeSession,
    isMobile,
    timestamp: new Date().toISOString()
  })

  // Public routes - no authentication required
  const publicRoutes = [
    '/auth',
    '/debug',
    '/privacy',
    '/terms',
    '/faq',
    '/compliance',
    '/api',
    '/home',
    '/demo',
    '/pricing',
  ]

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  if (isPublicRoute) {
    console.log('[PUBLIC ROUTE ALLOWED]', {
      pathname,
      hasUser: !!user,
      reason: 'Route is in publicRoutes allowlist'
    })
    return res
  }

  // Auth page redirect - redirect authenticated users to dashboard
  const authRoutes = ['/signup', '/login', '/auth/signin', '/auth/signup']
  const isAuthRoute = authRoutes.some(route => pathname === route || pathname === route + '/')

  if (isAuthRoute && user) {
    console.log('[Middleware] Authenticated user on auth page, redirecting to dashboard')
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // Special handling for homepage - redirect authenticated users
  if (pathname === '/') {
    if (user) {
      console.log('[MIDDLEWARE REDIRECT SIGNED IN TO DASHBOARD]', {
        pathname,
        hasUser: !!user,
        userId: user?.id
      })
      
      // Check for last visited dashboard route from cookie
      const lastDashboardRoute = req.cookies.get('last_dashboard_route')?.value
      
      // Check if user has completed onboarding
      // For now, we'll redirect to dashboard if authenticated
      // TODO: Add onboarding status check via database query if needed
      const redirectTarget = lastDashboardRoute && lastDashboardRoute.startsWith('/dashboard') 
        ? lastDashboardRoute 
        : '/dashboard'
      
      console.log('[MIDDLEWARE REDIRECTING TO DASHBOARD]', {
        from: pathname,
        to: redirectTarget,
        lastDashboardRoute
      })
      
      return NextResponse.redirect(new URL(redirectTarget, req.url))
    }
    
    // Not authenticated - allow homepage access
    console.log('[ROUTE CHECK]', {
      pathname,
      hasUser: !!user,
      action: 'Allowing homepage access for unauthenticated user'
    })
    return res
  }

  // Protected routes - require authentication
  const protectedRoutes = [
    '/dashboard',
    '/onboarding',
    '/settings',
    '/leads',
    '/conversations',
  ]

  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  // Bypass auth redirects for billing return requests - let client-side grace mode handle auth restoration
  if (isBillingReturn || hasStripeSession) {
    console.log('[MIDDLEWARE BILLING RETURN ALLOWED]', {
      pathname,
      search,
      isBillingReturn,
      hasStripeSession,
      hasUser: !!user,
      isMobile,
      timestamp: new Date().toISOString()
    })
    return NextResponse.next()
  }

  // Allow users returning from Stripe Billing Portal without immediate redirect
  // Give session restoration a chance to complete
  const billingReturned = url.searchParams.get('billing') === 'returned'

  if (isProtectedRoute && !user && !billingReturned && !hasCheckoutSuccess) {
    console.log('[MIDDLEWARE PROTECTED ROUTE REDIRECT]', {
      pathname,
      search,
      hasUser: !!user,
      isBillingReturn,
      hasStripeSession,
      hasCheckoutSuccess,
      billingReturned,
      isMobile,
      timestamp: new Date().toISOString()
    })
    console.log('[MIDDLEWARE REDIRECTING TO SIGNIN]', {
      from: pathname,
      to: '/auth/signin',
      reason: 'Protected route without session',
      hasUser: false,
      billingReturned,
      isMobile,
      component: 'Middleware',
      timestamp: new Date().toISOString()
    })
    return NextResponse.redirect(new URL('/auth/signin', req.url))
  }

  // Allow checkout success requests through for client-side recovery
  if (isProtectedRoute && !user && hasCheckoutSuccess) {
    console.log('[MIDDLEWARE CHECKOUT RECOVERY ALLOWED]', {
      pathname,
      search,
      hasUser: false,
      hasCheckoutSuccess: true,
      billingReturned,
      isMobile,
      timestamp: new Date().toISOString()
    })
  }

  console.log('[MIDDLEWARE ALLOWING ACCESS]', {
    pathname,
    hasUser: !!user,
    isProtectedRoute,
    hasCheckoutSuccess,
    isMobile,
    timestamp: new Date().toISOString()
  })

  // Security headers
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  
  // Content Security Policy (basic CSP that doesn't break Stripe, Supabase, Twilio, or Vercel)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://checkout.stripe.com https://cdn.twilio.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.stripe.com https://checkout.stripe.com https://api.twilio.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  ].join('; ')
  
  res.headers.set('Content-Security-Policy', csp)

  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - /privacy (public legal page)
     * - /terms (public legal page)
     * - /compliance (public legal page)
     * - /api/twilio/* (Twilio webhooks - use signature validation instead)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|privacy|terms|compliance|api/twilio).*)',
  ],
}
