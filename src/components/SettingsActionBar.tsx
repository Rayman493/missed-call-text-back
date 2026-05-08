'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface SettingsActionBarProps {
  hasUnsavedChanges: boolean
  onSave: () => Promise<void>
  onDiscard: () => void
  isSaving: boolean
  saveError: string | null
  clearError: () => void
}

export default function SettingsActionBar({
  hasUnsavedChanges,
  onSave,
  onDiscard,
  isSaving,
  saveError,
  clearError
}: SettingsActionBarProps) {
  const router = useRouter()
  const [showMobileBar, setShowMobileBar] = useState(false)

  // Handle navigation guard for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        const message = 'You have unsaved changes. Are you sure you want to leave?'
        e.preventDefault()
        e.returnValue = message
        return message
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setShowMobileBar(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleSave = async () => {
    clearError()
    await onSave()
  }

  const handleDiscard = () => {
    if (window.confirm('Are you sure you want to discard all unsaved changes?')) {
      onDiscard()
    }
  }

  // Desktop: Sticky top bar
  if (!showMobileBar) {
    return (
      <>
        {/* Spacer to prevent content from being hidden behind sticky bar */}
        <div className="h-16" />
        
        {/* Sticky Action Bar */}
        <div className="fixed top-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                {hasUnsavedChanges && (
                  <>
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                      You have unsaved changes
                    </span>
                  </>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                {saveError && (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800/30">
                    {saveError}
                  </div>
                )}
                
                {hasUnsavedChanges && (
                  <button
                    onClick={handleDiscard}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Discard Changes
                  </button>
                )}
                
                <button
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Mobile: Sticky bottom bar
  return (
    <>
      {/* Spacer to prevent content from being hidden behind bottom bar */}
      <div className="h-20" />
      
      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            {hasUnsavedChanges && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                  Unsaved changes
                </span>
              </div>
            )}
          </div>
          
          {saveError && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800/30 mb-2">
              {saveError}
            </div>
          )}
          
          <div className="flex gap-2">
            {hasUnsavedChanges && (
              <button
                onClick={handleDiscard}
                disabled={isSaving}
                className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Discard
              </button>
            )}
            
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
