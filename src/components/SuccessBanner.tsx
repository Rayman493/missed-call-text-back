'use client'

import { useEffect, useState } from 'react'
import { CheckCircle } from 'lucide-react'

interface SuccessBannerProps {
  primary?: string
  secondary?: string
  message?: string
  duration?: number
  onComplete?: () => void
}

export default function SuccessBanner({ primary, secondary, message, duration = 3500, onComplete }: SuccessBannerProps) {
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

    // Auto-hide after duration
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
          ? 'bg-green-50/80 dark:bg-green-950/40 border-green-200/60 dark:border-green-800/40'
          : isExiting
            ? 'opacity-0 translate-y-[-4px] bg-green-50/80 dark:bg-green-950/40 border-green-200/60 dark:border-green-800/40'
            : 'opacity-100 translate-y-0 bg-green-50/90 dark:bg-green-950/50 border-green-200 dark:border-green-800/50'
      }`}
      style={!prefersReducedMotion ? {
        transitionDuration: '180ms',
        transitionTimingFunction: 'ease-out'
      } : undefined}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-green-900 dark:text-green-100">
            {primaryText}
          </div>
          {secondaryText && (
            <div className="text-xs text-green-700 dark:text-green-300 mt-0.5">
              {secondaryText}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
