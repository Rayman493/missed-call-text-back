/**
 * ASWebAuthenticationSession Diagnostic Test Start Page
 *
 * This is a temporary diagnostic route to test whether Capacitor WKWebView
 * Supabase/localStorage sessions survive ASWebAuthenticationSession presentation.
 *
 * This page:
 * - Automatically redirects to the callback URL after a brief delay
 * - Contains no PII, auth tokens, or billing data
 * - Performs no writes or state modifications
 * - Is public and harmless
 */

'use client'

import { useEffect } from 'react'

export default function NativeSessionTestStartPage() {
  useEffect(() => {
    // Brief delay to ensure the page loads before redirect
    const timer = setTimeout(() => {
      // Redirect to callback URL to trigger ASWebAuthenticationSession completion
      window.location.href = '/native-session-test/callback?test=1'
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-gray-600">Session test in progress...</p>
      </div>
    </div>
  )
}