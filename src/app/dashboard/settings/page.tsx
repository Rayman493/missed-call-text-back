'use client'

import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [isClient, setIsClient] = useState(false)
  const [SettingsContent, setSettingsContent] = useState<any>(null)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Dynamically import the full settings component only on client side
        const { default: SettingsComponent } = await import('@/components/SettingsContent')
        setSettingsContent(() => SettingsComponent)
        setIsClient(true)
      } catch (error) {
        console.error('Failed to load settings:', error)
        setIsClient(true)
      }
    }

    loadSettings()
  }, [])

  if (!isClient || !SettingsContent) {
    // Return a loading state during SSR or while loading
    return (
      <div className="min-h-screen bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading settings...</p>
          </div>
        </div>
      </div>
    )
  }

  return <SettingsContent />
}
