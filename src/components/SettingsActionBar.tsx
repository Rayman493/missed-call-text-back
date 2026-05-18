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
  saveSuccess: boolean
  clearSuccess: () => void
}

export default function SettingsActionBar({
  hasUnsavedChanges,
  onSave,
  onDiscard,
  isSaving,
  saveError,
  clearError,
  saveSuccess,
  clearSuccess
}: SettingsActionBarProps) {
  const router = useRouter()
  const [showMobileBar, setShowMobileBar] = useState(false)

  // Auto-hide success state after 1.5 seconds
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => {
        clearSuccess()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [saveSuccess, clearSuccess])

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

  // Only render the sticky save bar if there are unsaved changes
  if (!hasUnsavedChanges) {
    return null
  }

  // Sticky Bottom Action Bar (same for both desktop and mobile)
  return (
    <>
      {/* Spacer to prevent content from being hidden behind sticky bar */}
      <div className="h-20" />
      
      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3 sm:py-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-foreground">
                {showMobileBar ? 'Unsaved changes' : 'You have unsaved changes'}
              </span>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              {saveError && (
                <div className="text-xs sm:text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-red-200 dark:border-red-800/30">
                  {saveError}
                </div>
              )}
              
              <button
                onClick={handleDiscard}
                disabled={isSaving}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {showMobileBar ? 'Discard' : 'Discard Changes'}
              </button>
              
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saveSuccess ? (
                  <>
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {showMobileBar ? 'Saved' : 'Saved'}
                  </>
                ) : isSaving ? (
                  <>
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {showMobileBar ? 'Saving...' : 'Saving...'}
                  </>
                ) : (
                  showMobileBar ? 'Save' : 'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
