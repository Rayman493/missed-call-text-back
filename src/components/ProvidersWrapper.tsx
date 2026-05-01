'use client'

import { useState, useEffect } from 'react'

interface ProvidersWrapperProps {
  children: React.ReactNode
}

// Mock providers for SSR to prevent hydration issues
const MockAuthProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>
const MockBusinessProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>
const MockThemeProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>

export default function ProvidersWrapper({ children }: ProvidersWrapperProps) {
  const [isClient, setIsClient] = useState(false)
  const [AuthProvider, setAuthProvider] = useState<any>(() => MockAuthProvider)
  const [BusinessProvider, setBusinessProvider] = useState<any>(() => MockBusinessProvider)
  const [ThemeProvider, setThemeProvider] = useState<any>(() => MockThemeProvider)

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
        setIsClient(true)
      } catch (error) {
        console.error('Failed to load providers:', error)
        setIsClient(true)
      }
    }

    loadProviders()
  }, [])

  if (!isClient) {
    // Return mock providers during SSR
    return (
      <MockThemeProvider>
        <MockAuthProvider>
          <MockBusinessProvider>{children}</MockBusinessProvider>
        </MockAuthProvider>
      </MockThemeProvider>
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
