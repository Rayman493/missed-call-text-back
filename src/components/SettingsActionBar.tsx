'use client'

import { useState, useEffect } from 'react'

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
  const [showMobileBar, setShowMobileBar] = useState(false)

  // Auto-hide success state after 1 second
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => {
        clearSuccess()
      }, 1000)
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

  // Only render the sticky save bar if there are unsaved changes or save feedback is visible
  if (!hasUnsavedChanges && !isSaving && !saveSuccess) {
    return null
  }

  // Sticky Bottom Action Bar (same for both desktop and mobile)
  return (
    <>
      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 animate-in slide-in-from-bottom-3 fade-in duration-200">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 pb-3 sm:pb-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-white/95 dark:bg-slate-950/95 px-3 py-2.5 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${saveSuccess ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {saveSuccess ? 'Saved' : showMobileBar ? 'Unsaved Changes' : 'Unsaved Changes'}
              </span>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              {saveError && (
                <div className="hidden max-w-[320px] truncate rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300 sm:block">
                  {saveError}
                </div>
              )}
              
              <button
                onClick={handleDiscard}
                disabled={isSaving || saveSuccess}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:px-4 sm:text-sm"
              >
                {showMobileBar ? 'Discard' : 'Discard'}
              </button>
              
              <button
                onClick={handleSave}
                disabled={isSaving || saveSuccess}
                className={`inline-flex min-w-[104px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2 focus:ring-offset-background active:scale-[0.98] disabled:cursor-not-allowed sm:min-w-[128px] sm:px-4 sm:text-sm ${
                  saveSuccess
                    ? 'bg-emerald-600'
                    : 'bg-blue-600 hover:bg-blue-500 hover:shadow-[0_8px_24px_rgba(37,99,235,0.28)] disabled:bg-blue-500/70'
                }`}
              >
                {saveSuccess ? (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </>
                ) : isSaving ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  showMobileBar ? 'Save' : 'Save Changes'
                )}
              </button>
            </div>
          </div>
          {saveError && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300 sm:hidden">
              {saveError}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
