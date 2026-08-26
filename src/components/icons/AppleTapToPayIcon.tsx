'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { renderSFSymbol, getSFSymbolDataUrl } from '@/lib/sf-symbol-renderer'

export interface AppleTapToPayIconProps {
  className?: string
  size?: number
}

/**
 * Apple Tap to Pay Icon
 *
 * On iOS: Renders genuine wave.3.right.circle SF Symbol using native UIImage(systemName:)
 * On Android/Web: Renders a fallback SVG approximation
 *
 * The iOS implementation ensures Apple HIG compliance for Tap to Pay on iPhone.
 */
export default function AppleTapToPayIcon({ className = '', size = 24 }: AppleTapToPayIconProps) {
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
        const result = await getSFSymbolDataUrl({
          symbolName: 'wave.3.right.circle',
          size: size,
          weight: 'regular',
          scale: 'default'
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
  }, [isIOS, size])

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

  // Android/Web: Fallback SVG approximation
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
      <circle cx="12" cy="12" r="10" fill="currentColor"/>
      <path d="M8 12C8 12 9 8 12 8C15 8 15 14 15 14C15 14 13 16 13 16M13 16L15 14M13 16L15 18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}