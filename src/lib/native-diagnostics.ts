'use client'

import { Capacitor } from '@capacitor/core'

/**
 * Returns true when the named diagnostic flag is enabled on a native
 * Capacitor build via localStorage or a query parameter.
 */
export function isNativeDiagnosticEnabled(flag: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (!Capacitor.isNativePlatform()) return false
    return (
      window.localStorage?.getItem(flag) === '1' ||
      new URLSearchParams(window.location.search).has(flag)
    )
  } catch {
    return false
  }
}

const LOG_FILE = 'RF_Diagnostics.log'

/**
 * Appends one JSON line to a diagnostic log file in the app's external files
 * directory so physical-device traces can be pulled with `adb pull` even when
 * WebView console output is not forwarded to logcat.
 */
export async function appendNativeDiagnostic(tag: string, payload: Record<string, unknown>, flag: string) {
  if (!isNativeDiagnosticEnabled(flag)) return
  const line = `${tag} ${JSON.stringify(payload)}\n`
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    try {
      await Filesystem.appendFile({
        path: LOG_FILE,
        data: line,
        directory: Directory.External,
        encoding: Encoding.UTF8,
      })
    } catch {
      // First event — file may not exist yet.
      await Filesystem.writeFile({
        path: LOG_FILE,
        data: line,
        directory: Directory.External,
        encoding: Encoding.UTF8,
        recursive: true,
      })
    }
  } catch {
    // Diagnostics must never throw into the product path.
  }
}
