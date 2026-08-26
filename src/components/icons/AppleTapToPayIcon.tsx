'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { renderSFSymbol, getSFSymbolDataUrl } from '@/lib/sf-symbol-renderer'

export interface AppleTapToPayIconProps {
  className?: string
  size?: number
  color?: string // Explicit hex color for iOS native rendering
}

/**
 * Apple Tap to Pay Icon
 *
 * On iOS: Renders genuine wave.3.right.circle SF Symbol using native UIImage(systemName:)
 * On Android/Web: Renders a fallback SVG approximation
 *
 * The iOS implementation ensures Apple HIG compliance for Tap to Pay on iPhone.
 *
 * Color handling:
 * - iOS: Uses native UIImage tinting with explicit color from props or theme detection
 * - Android/Web: Uses CSS currentColor (responds to className)
 */
export default function AppleTapToPayIcon({ className = '', size = 24, color }: AppleTapToPayIconProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const isIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

  useEffect(() => {
    if (!isIOS) {
      setIsLoading(false)
      return
    }

    // Render genuine SF Symbol on iOS
    let mounted = true

    const renderSymbol = async () => {
      try {
        // Determine color for iOS native rendering
        // If explicit color is provided, use it
        // Otherwise, detect dark mode and use appropriate default
        let iosColor = color

        if (!iosColor) {
          // Detect dark mode
          const isDarkMode = document.documentElement.classList.contains('dark')

          // Default colors for Tap to Pay context
          // Light mode: dark green/gray for visibility
          // Dark mode: white/light for visibility
          if (isDarkMode) {
            iosColor = '#ffffff' // White for dark mode
          } else {
            iosColor = '#16a34a' // Green-600 equivalent for light mode
          }
        }

        const result = await getSFSymbolDataUrl({
          symbolName: 'wave.3.right.circle',
          size: size,
          weight: 'regular',
          scale: 'default',
          tintColor: iosColor
        })

        if (mounted && result) {
          setDataUrl(result)
        }
      } catch (error) {
        console.error('[AppleTapToPayIcon] Failed to render SF Symbol:', error)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    renderSymbol()

    return () => {
      mounted = false
    }
  }, [isIOS, size, color])

  // iOS: Use genuine SF Symbol
  if (isIOS) {
    if (isLoading) {
      // Loading placeholder
      return (
        <div
          className={className}
          style={{ width: size, height: size }}
          aria-hidden="true"
        />
      )
    }

    if (dataUrl) {
      return (
        <img
          src={dataUrl}
          alt=""
          className={className}
          width={size}
          height={size}
          style={{ display: 'block' }}
          aria-hidden="true"
        />
      )
    }
  }

  // Android/Web: Fallback SVG approximation (uses currentColor from className)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 8C14.21 8 16 9.79 16 12C16 14.21 14.21 16 12 16C9.79 16 8 14.21 8 12C8 9.79 9.79 8 12 8Z" fill="currentColor"/>
      <path d="M12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20C7.58 20 4 16.42 4 12C4 7.58 7.58 4 12 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 0C18.63 0 24 5.37 24 12C24 18.63 18.63 24 12 24C5.37 24 0 18.63 0 12C0 5.37 5.37 0 12 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}