'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface ProvidersWrapperProps {
  children: React.ReactNode
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

  // Trace log on every page load
  useEffect(() => {
    // Page load tracking removed for production
  }, [])

  useEffect(() => {
    const loadProviders = async () => {
      try {
        // Dynamically import providers only on client side
        const [{ AuthProvider: AP }, { BusinessProvider: BP }, { ThemeProvider: TP }, { VoicemailVolumeProvider: VP }, { VoicemailPlaybackManagerProvider: VMP }, { VoicemailProgressProvider: VPP }] = await Promise.all([
          import('@/contexts/AuthContext'),
          import('@/contexts/BusinessContext'),
          import('@/contexts/ThemeContext'),
          import('@/contexts/VoicemailVolumeContext'),
          import('@/contexts/VoicemailPlaybackManager'),
          import('@/contexts/VoicemailProgressContext')
        ])
        
        setAuthProvider(() => AP)
        setBusinessProvider(() => BP)
        setThemeProvider(() => TP)
        setVoicemailVolumeProvider(() => VP)
        setVoicemailPlaybackManagerProvider(() => VMP)
        setVoicemailProgressProvider(() => VPP)
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
  if (!isClient || !providersLoaded || !AuthProvider || !BusinessProvider || !ThemeProvider || !VoicemailVolumeProvider || !VoicemailPlaybackManagerProvider || !VoicemailProgressProvider) {
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
            <VoicemailPlaybackManagerProvider>
              <VoicemailProgressProvider key={pathname}>{children}</VoicemailProgressProvider>
            </VoicemailPlaybackManagerProvider>
          </VoicemailVolumeProvider>
        </BusinessProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
