'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface ProvidersWrapperProps {
  children: React.ReactNode
}

// Public routes that don't require authenticated app providers
// Use exact matching to avoid classifying all routes as public
const PUBLIC_ROUTES = new Set([
  '/',
  '/home',
  '/pricing',
  '/faq',
  '/privacy',
  '/terms',
])

function normalizePathname(pathname: string | null): string {
  if (!pathname) return ''
  // Remove trailing slash for consistent matching
  return pathname.endsWith('/') && pathname.length > 1 
    ? pathname.slice(0, -1) 
    : pathname
}

export default function ProvidersWrapper({ children }: ProvidersWrapperProps) {
  const pathname = usePathname()
  const [isClient, setIsClient] = useState(false)

  // Route transition observer - neutral observer that logs pathname changes
  const previousPathnameRef = useRef<string | null>(null)
  useEffect(() => {
    const currentPathname = pathname
    if (previousPathnameRef.current !== null && previousPathnameRef.current !== currentPathname) {
      console.log('[ROUTE_TRANSITION_OBSERVED]', {
        previousPathname: previousPathnameRef.current,
        nextPathname: currentPathname,
        timestamp: Date.now()
      })
    }
    previousPathnameRef.current = currentPathname
  }, [pathname])

  // Document-level click capture for navigation targets
  useEffect(() => {
    if (!isClient) return

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (anchor) {
        const href = anchor.getAttribute('href')
        // Only log navigation to /dashboard/leads or /dashboard/calendar
        if (href === '/dashboard/leads' || href === '/dashboard/calendar' || href?.startsWith('/dashboard/leads/') || href?.startsWith('/dashboard/calendar/')) {
          console.log('[CLICK_CAPTURE_DIAGNOSTIC]', {
            targetTag: anchor.tagName.toLowerCase(),
            nearestHref: href,
            pathname,
            timestamp: Date.now()
          })
        }
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [isClient, pathname])

  // Popstate observation
  useEffect(() => {
    if (!isClient) return

    const handlePopState = () => {
      console.log('[POPSTATE_DIAGNOSTIC]', {
        pathname: window.location.pathname,
        timestamp: Date.now()
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isClient])

  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [AuthProvider, setAuthProvider] = useState<any>(null)
  const [BusinessProvider, setBusinessProvider] = useState<any>(null)
  const [ThemeProvider, setThemeProvider] = useState<any>(null)
  const [VoicemailVolumeProvider, setVoicemailVolumeProvider] = useState<any>(null)
  const [VoicemailPlaybackManagerProvider, setVoicemailPlaybackManagerProvider] = useState<any>(null)
  const [VoicemailProgressProvider, setVoicemailProgressProvider] = useState<any>(null)
  const [NotificationProvider, setNotificationProvider] = useState<any>(null)

  // Check if current route is public
  // Use exact matching to avoid classifying all routes as public
  // Do NOT gate on isClient - public routes must be detected on initial render to prevent AppLoadingScreen flash
  const normalizedPathname = normalizePathname(pathname)
  const isPublicRoute = Boolean(pathname) && PUBLIC_ROUTES.has(normalizedPathname)

  // Cleanup public-route-dark class when navigating away from public routes
  useEffect(() => {
    const cleanupPublicRouteClass = () => {
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('public-route-dark')
      }
    }

    // If not on public route, remove the class immediately
    if (!isPublicRoute) {
      cleanupPublicRouteClass()
    }

    // Cleanup on unmount
    return cleanupPublicRouteClass
  }, [isPublicRoute])

  // Trace log on every page load
  useEffect(() => {
    // Page load tracking removed for production
  }, [])

  useEffect(() => {
    setIsClient(true)
    
    const loadProviders = async () => {
      try {
        // Dynamically import providers only on client side
        const [{ AuthProvider: AP }, { BusinessProvider: BP }, { ThemeProvider: TP }, { VoicemailVolumeProvider: VP }, { VoicemailPlaybackManagerProvider: VMP }, { VoicemailProgressProvider: VPP }, { NotificationProvider: NP }] = await Promise.all([
          import('@/contexts/AuthContext'),
          import('@/contexts/BusinessContext'),
          import('@/contexts/ThemeContext'),
          import('@/contexts/VoicemailVolumeContext'),
          import('@/contexts/VoicemailPlaybackManager'),
          import('@/contexts/VoicemailProgressContext'),
          import('@/contexts/NotificationContext')
        ])
        
        setAuthProvider(() => AP)
        setBusinessProvider(() => BP)
        setThemeProvider(() => TP)
        setVoicemailVolumeProvider(() => VP)
        setVoicemailPlaybackManagerProvider(() => VMP)
        setVoicemailProgressProvider(() => VPP)
        setNotificationProvider(() => NP)
        setProvidersLoaded(true)
      } catch (error) {
        console.error('Failed to load providers:', error)
        setProvidersLoaded(true)
      }
    }

    loadProviders()
  }, [])

  // For public routes, render dark bootstrap while essential providers load, then wrap with providers
  // Skip NotificationProvider and voicemail providers on public routes (not needed)
  // Skip the loading screen on public routes to prevent theme flash
  if (isPublicRoute) {
    // While essential providers are loading, show dark bootstrap to prevent context errors
    // ThemeProvider, AuthProvider, and BusinessProvider are required for public routes:
    // - ThemeProvider for theming
    // - AuthProvider for NativeLandingWrapper, HomepageCTA, Navbar
    // - BusinessProvider for UserDropdown (rendered by Navbar when user is logged in)
    if (!isClient || !ThemeProvider || !AuthProvider || !BusinessProvider) {
      return (
        <div className="min-h-screen bg-slate-950" />
      )
    }
    // Once essential providers are loaded, wrap public content
    return (
      <ThemeProvider>
        <AuthProvider>
          <BusinessProvider>
            {children}
          </BusinessProvider>
        </AuthProvider>
      </ThemeProvider>
    )
  }

  // Don't render anything until all providers are loaded to prevent context errors
  // Only applies to authenticated routes
  if (!isClient || !providersLoaded || !AuthProvider || !BusinessProvider || !ThemeProvider || !VoicemailVolumeProvider || !VoicemailPlaybackManagerProvider || !VoicemailProgressProvider || !NotificationProvider) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <BusinessProvider>
          <NotificationProvider>
            <VoicemailVolumeProvider>
              <VoicemailPlaybackManagerProvider>
                <VoicemailProgressProvider key={pathname}>{children}</VoicemailProgressProvider>
              </VoicemailPlaybackManagerProvider>
            </VoicemailVolumeProvider>
          </NotificationProvider>
        </BusinessProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
