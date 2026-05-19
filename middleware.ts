import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const pathname = req.nextUrl.pathname

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

  // Refresh session if expired
  const { data: { session } } = await supabase.auth.getSession()

  console.log('[Middleware] Request:', {
    pathname,
    hasSession: !!session,
    method: req.method,
  })

  // Public routes - no authentication required
  const publicRoutes = [
    '/',
    '/signup',
    '/login',
    '/auth',
    '/auth/signin',
    '/auth/signup',
    '/debug',
    '/privacy',
    '/terms',
    '/faq',
    '/compliance',
    '/api',
  ]

  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  if (isPublicRoute) {
    console.log('[Middleware] Public route, allowing access')
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

  // Allow users returning from Stripe Billing Portal without immediate redirect
  // Give session restoration a chance to complete
  const url = new URL(req.url)
  const billingReturned = url.searchParams.get('billing') === 'returned'

  if (isProtectedRoute && !session && !billingReturned) {
    console.log('[Middleware] Protected route without session, redirecting to sign-in')
    console.log('[Middleware REDIRECT]', {
      from: pathname,
      to: '/auth/signin',
      reason: 'Protected route without session',
      hasSession: false,
      billingReturned,
      component: 'Middleware',
    })
    return NextResponse.redirect(new URL('/auth/signin', req.url))
  }

  console.log('[Middleware] Protected route with session, allowing access')

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
