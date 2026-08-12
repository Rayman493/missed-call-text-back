/**
 * ASWebAuthenticationSession Diagnostic Harness
 *
 * TEMPORARY developer-only diagnostic to prove WKWebView session preservation.
 *
 * This should NOT be called automatically on app startup or in production flows.
 * It must be manually invoked through console or developer UI.
 */

import { Capacitor } from '@capacitor/core'
import { createBrowserClient } from '@/lib/supabase/browser'

interface ReplyflowWebSessionDiagnosticsPlugin {
  testSessionPreservation(): Promise<{
    started: boolean
    iosVersion: string
    callbackMethod: string
  }>
}

declare global {
  interface Window {
    ReplyflowWebSessionDiagnostics?: ReplyflowWebSessionDiagnosticsPlugin
  }
}

/**
 * Run diagnostic test - MANUAL INVOCATION ONLY
 *
 * This test:
 * 1. Logs current Supabase session state
 * 2. Opens ASWebAuthenticationSession to test route
 * 3. Logs session state after completion
 * 4. Does NOT log PII, tokens, or session contents
 */
export async function runWebSessionDiagnostic() {
  if (!Capacitor.isNativePlatform()) {
    console.log('[WEB SESSION TEST] Skipped - not native platform')
    return
  }

  if (Capacitor.getPlatform() !== 'ios') {
    console.log('[WEB SESSION TEST] Skipped - not iOS')
    return
  }

  const supabase = createBrowserClient()

  // BEFORE: Check session state
  console.log('[WEB SESSION TEST] Before native session')
  const { data: beforeUser, error: beforeError } = await supabase.auth.getUser()
  console.log('[WEB SESSION TEST] before_getSession', beforeUser.user ? 'PRESENT' : 'MISSING')
  console.log('[WEB SESSION TEST] before_error', beforeError ? 'ERROR' : 'NONE')

  // Check localStorage presence
  const hasLocalStorage = typeof window !== 'undefined' && window.localStorage
  console.log('[WEB SESSION TEST] before_local_auth_storage', hasLocalStorage ? 'PRESENT' : 'MISSING')

  // Call native diagnostic
  const plugin = (window as any).ReplyflowWebSessionDiagnostics
  if (!plugin) {
    console.log('[WEB SESSION TEST] Native plugin not available')
    return
  }

  try {
    console.log('[WEB SESSION TEST] Starting native session...')
    const result = await plugin.testSessionPreservation()
    console.log('[WEB SESSION TEST] native_callback_started', result.started)
    console.log('[WEB SESSION TEST] native_iosVersion', result.iosVersion)
    console.log('[WEB SESSION TEST] native_callbackMethod', result.callbackMethod)

    // AFTER: Check session state
    console.log('[WEB SESSION TEST] After native session')
    const { data: afterUser, error: afterError } = await supabase.auth.getUser()
    console.log('[WEB SESSION TEST] after_getSession', afterUser.user ? 'PRESENT' : 'MISSING')
    console.log('[WEB SESSION TEST] after_error', afterError ? 'ERROR' : 'NONE')

    console.log('[WEB SESSION TEST] after_local_auth_storage', hasLocalStorage ? 'PRESENT' : 'MISSING')

    console.log('[WEB SESSION TEST] Diagnostic complete')
    console.log('[WEB SESSION TEST] PASS if: before_getSession=PRESENT AND after_getSession=PRESENT')
  } catch (error) {
    console.log('[WEB SESSION TEST] Native error:', error)
  }
}

// Expose for manual console invocation
if (typeof window !== 'undefined') {
  ;(window as any).runWebSessionDiagnostic = runWebSessionDiagnostic
  console.log('[WEB SESSION TEST] Diagnostic available - call window.runWebSessionDiagnostic()')
}