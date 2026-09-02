'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Native return trampoline for Stripe Billing Portal
 *
 * This page is used as the HTTPS return_url for Stripe Billing Portal
 * because Stripe does not accept custom URI schemes (replyflow://)
 *
 * When Stripe returns here, we immediately redirect to the native ReplyFlow app
 * via the replyflow:// custom scheme, which will:
 * 1. Generate a native Android intent to MainActivity
 *  * 2. Trigger the existing ReplyflowWebCheckoutPlugin callback handling
 *
 * Security: This page does NOT require authentication and does NOT expose any
 * sensitive data. It only redirects to a hardcoded native URI pattern.
 */
export default function NativeReturnBillingPage() {
  const router = useRouter()

  useEffect(() => {
    // Get query parameters
    const query = new URLSearchParams(window.location.search)
    const billing = query.get('billing')

    if (billing === 'returned') {
      // Redirect to native ReplyFlow app via custom scheme
      // The replyflow:// scheme is registered in AndroidManifest.xml
      window.location.href = 'replyflow://billing?billing=returned'
    } else {
      // Invalid or missing parameter - redirect to dashboard
      window.location.href = '/dashboard'
    }
  }, [])

  // Show loading state while redirecting
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#020617',
      color: 'white'
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '14px' }}>Returning to ReplyFlow...</p>
      </div>
    </div>
  )
}