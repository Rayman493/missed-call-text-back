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

  useEffect(() => {
    const loadProviders = async () => {
      try {
        // Dynamically import providers only on client side
        const [{ AuthProvider: AP }, { BusinessProvider: BP }, { ThemeProvider: TP }] = await Promise.all([
          import('@/contexts/AuthContext'),
          import('@/contexts/BusinessContext'),
          import('@/contexts/ThemeContext')
        ])
        
        setAuthProvider(() => AP)
        setBusinessProvider(() => BP)
        setThemeProvider(() => TP)
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
  if (!isClient || !providersLoaded || !AuthProvider || !BusinessProvider || !ThemeProvider) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <BusinessProvider>{children}</BusinessProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
