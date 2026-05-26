'use client'

import { useState, useEffect } from 'react'

interface ProvidersWrapperProps {
  children: React.ReactNode
}

export default function ProvidersWrapper({ children }: ProvidersWrapperProps) {
  const [isClient, setIsClient] = useState(false)
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [AuthProvider, setAuthProvider] = useState<any>(null)
  const [BusinessProvider, setBusinessProvider] = useState<any>(null)
  const [ThemeProvider, setThemeProvider] = useState<any>(null)
  const [VoicemailVolumeProvider, setVoicemailVolumeProvider] = useState<any>(null)
  const [VoicemailPlaybackManagerProvider, setVoicemailPlaybackManagerProvider] = useState<any>(null)

  // Trace log on every page load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768
      console.log('[TRACE Page Load]', {
        pathname: window.location.pathname,
        search: window.location.search,
        href: window.location.href,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        isMobile
      })
    }
  }, [])

  useEffect(() => {
    const loadProviders = async () => {
      try {
        // Dynamically import providers only on client side
        const [{ AuthProvider: AP }, { BusinessProvider: BP }, { ThemeProvider: TP }, { VoicemailVolumeProvider: VP }, { VoicemailPlaybackManagerProvider: VMP }] = await Promise.all([
          import('@/contexts/AuthContext'),
          import('@/contexts/BusinessContext'),
          import('@/contexts/ThemeContext'),
          import('@/contexts/VoicemailVolumeContext'),
          import('@/contexts/VoicemailPlaybackManager')
        ])
        
        setAuthProvider(() => AP)
        setBusinessProvider(() => BP)
        setThemeProvider(() => TP)
        setVoicemailVolumeProvider(() => VP)
        setVoicemailPlaybackManagerProvider(() => VMP)
        setProvidersLoaded(true)
        setIsClient(true)
      } catch (error) {
        console.error('Failed to load providers:', error)
        setIsClient(true)
      }
    }

    loadProviders()
  }, [])

  // Don't render anything until providers are loaded to prevent context errors
  if (!isClient || !providersLoaded || !AuthProvider || !BusinessProvider || !ThemeProvider || !VoicemailVolumeProvider || !VoicemailPlaybackManagerProvider) {
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
          <VoicemailVolumeProvider>
            <VoicemailPlaybackManagerProvider>{children}</VoicemailPlaybackManagerProvider>
          </VoicemailVolumeProvider>
        </BusinessProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
