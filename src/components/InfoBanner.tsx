'use client'

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'

interface InfoBannerProps {
  primary?: string
  secondary?: string
  message?: string
  duration?: number
  onComplete?: () => void
}

export default function InfoBanner({ primary, secondary, message, duration = 5000, onComplete }: InfoBannerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  // Support both new structured format and legacy string format
  const primaryText = primary || message?.split('\n')[0] || ''
  const secondaryText = secondary || message?.split('\n')[1] || ''

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!prefersReducedMotion) {
      // Animate in
      setIsVisible(true)
    } else {
      // Skip animation for reduced motion
      setIsVisible(true)
    }

    // Auto-hide after duration (longer for info messages since they're guidance)
    const timer = setTimeout(() => {
      if (!prefersReducedMotion) {
        setIsExiting(true)
        setTimeout(() => {
          setIsVisible(false)
          onComplete?.()
        }, 180) // Fade out duration
      } else {
        setIsVisible(false)
        onComplete?.()
      }
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onComplete])

  if (!isVisible) return null

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div
      className={`rounded-lg border px-4 py-2 transition-all ${
        prefersReducedMotion
          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-800/40'
          : isExiting
            ? 'opacity-0 translate-y-[-4px] bg-blue-50/80 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-800/40'
            : 'opacity-100 translate-y-0 bg-blue-50/90 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800/50'
      }`}
      style={!prefersReducedMotion ? {
        transitionDuration: '180ms',
        transitionTimingFunction: 'ease-out'
      } : undefined}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            {primaryText}
          </div>
          {secondaryText && (
            <div className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
              {secondaryText}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}