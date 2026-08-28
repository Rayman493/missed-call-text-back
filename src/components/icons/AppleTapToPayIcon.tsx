'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Smartphone } from 'lucide-react'
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
 * On Android/Web: Renders Smartphone icon from lucide-react (safe standard library icon)
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

  // Android/Web: Use Smartphone icon from lucide-react (safe standard library icon)
  return (
    <Smartphone
      size={size}
      className={className}
      aria-hidden="true"
    />
  )
}