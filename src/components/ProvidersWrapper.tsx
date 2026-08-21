'use client'

import { useState, useEffect } from 'react'
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
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [AuthProvider, setAuthProvider] = useState<any>(null)
  const [BusinessProvider, setBusinessProvider] = useState<any>(null)
  const [ThemeProvider, setThemeProvider] = useState<any>(null)
  const [VoicemailVolumeProvider, setVoicemailVolumeProvider] = useState<any>(null)
  const [VoicemailPlaybackManagerProvider, setVoicemailPlaybackManagerProvider] = useState<any>(null)
  const [VoicemailProgressProvider, setVoicemailProgressProvider] = useState<any>(null)
  const [NotificationProvider, setNotificationProvider] = useState<any>(null)

  // Check if current route is public (after client-side hydration)
  // Use exact matching to avoid classifying all routes as public
  const isPublicRoute = isClient && pathname && PUBLIC_ROUTES.has(normalizePathname(pathname))

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

  // For public routes, render children immediately without waiting for providers
  // Public content doesn't need AuthProvider, BusinessProvider, etc. to render
  if (isPublicRoute) {
    return <>{children}</>
  }

  // Don't render anything until providers are loaded to prevent context errors
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
