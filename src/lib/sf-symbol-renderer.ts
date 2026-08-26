import { registerPlugin } from '@capacitor/core'

export interface SFSymbolRenderOptions {
  symbolName: string
  size?: number
  weight?: 'ultralight' | 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black'
  scale?: 'small' | 'medium' | 'large' | 'default'
  tintColor?: string // hex color, e.g., "#22c55e"
}

export interface SFSymbolRenderResult {
  base64: string
  symbolName: string
  size: number
  weight: string
  scale: string
}

export interface SFSymbolRendererPlugin {
  renderSymbol(options: SFSymbolRenderOptions): Promise<SFSymbolRenderResult>
}

const SFSymbolRenderer = registerPlugin<SFSymbolRendererPlugin>('SFSymbolRendererPlugin')

/**
 * Check if the native plugin is available (iOS only)
 */
export function isSFSymbolRendererAvailable(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/**
 * Import Capacitor for platform check
 */
import { Capacitor } from '@capacitor/core'

/**
 * Render a genuine Apple SF Symbol using native UIImage(systemName:)
 *
 * This function uses the native iOS SFSymbolRendererPlugin to render
 * authentic SF Symbols, ensuring Apple HIG compliance.
 *
 * On non-iOS platforms (Android, web), returns null.
 *
 * @param options - Symbol rendering options
 * @returns Base64-encoded PNG of the SF Symbol, or null if unavailable
 */
export async function renderSFSymbol(options: SFSymbolRenderOptions): Promise<SFSymbolRenderResult | null> {
  if (!isSFSymbolRendererAvailable()) {
    return null
  }

  try {
    const result = await SFSymbolRenderer.renderSymbol(options)
    return result
  } catch (error) {
    console.error('[SF Symbol] Failed to render symbol:', error)
    return null
  }
}

/**
 * Get the data URL for an SF Symbol image
 *
 * @param options - Symbol rendering options
 * @returns Data URL string (data:image/png;base64,...), or null if unavailable
 */
export async function getSFSymbolDataUrl(options: SFSymbolRenderOptions): Promise<string | null> {
  const result = await renderSFSymbol(options)
  if (!result) {
    return null
  }
  return `data:image/png;base64,${result.base64}`
}