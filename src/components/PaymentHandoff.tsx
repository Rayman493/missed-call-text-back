'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

interface PaymentHandoffProps {
  provider: 'venmo' | 'paypal'
  businessName: string
  amount: string
  description?: string | null
  checkoutUrl?: string | null
  venmoUsername?: string
}

export default function PaymentHandoff({
  provider,
  businessName,
  amount,
  description,
  checkoutUrl,
  venmoUsername
}: PaymentHandoffProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    const clearOpening = () => setOpening(false)

    const isNative = Capacitor.isNativePlatform()
    if (isNative) {
      let listenerHandle: { remove: () => void } | undefined
      let mounted = true

      import('@capacitor/app')
        .then((mod) => {
          if (!mounted) return
          const { App } = mod as any
          App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
            if (isActive) clearOpening()
          }).then((handle: any) => {
            listenerHandle = handle
          })
        })
        .catch(() => {
          // Not a Capacitor build; lifecycle fallback is not needed.
        })

      return () => {
        mounted = false
        listenerHandle?.remove?.()
      }
    }

    // Web/PWA: clear the CTA state when the customer returns to the page
    // from Venmo/Chrome, including bfcache restores.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') clearOpening()
    }
    const handlePageShow = (e: any) => {
      if (e.persisted) clearOpening()
    }
    const handleFocus = () => clearOpening()

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const providerName = provider === 'venmo' ? 'Venmo' : 'PayPal'
  const amountNumber = parseFloat(amount) || 0
  const formattedAmount = formatCurrency(amountNumber)

  // Deterministic external handoff:
  // - Preserve the configured recipient destination (checkoutUrl) on all
  //   platforms. The canonical Venmo URL is https://venmo.com/u/{username}.
  // - The generic https://venmo.com is only a safe fallback when the
  //   targeted checkoutUrl is missing.
  // - On native, use Browser.open so the OS resolves the app/App Link.
  // - On web/PWA, use window.open with _blank so the customer leaves the
  //   PWA/web surface and can return to it cleanly.
  const targetUrl = checkoutUrl || (provider === 'venmo' ? 'https://venmo.com' : '#')

  const openProvider = async () => {
    if (!targetUrl || targetUrl === '#') return

    setOpening(true)

    try {
      if (Capacitor.isNativePlatform()) {
        // Browser.open launches Chrome Custom Tab / SFSafariViewController;
        // the system then resolves the Universal/App Link to Venmo if installed.
        await Browser.open({ url: targetUrl })
      } else {
        window.open(targetUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      console.error(`[${providerName} HANDOFF] Failed to open:`, e)
    } finally {
      // Reset immediately after the handoff is dispatched. The lifecycle
      // listeners above guarantee the state is also cleared if the user
      // returns through bfcache or app resume.
      setOpening(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-6">
      <div className="max-w-md w-full">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-gray-900 mb-2">{formattedAmount}</h1>
          {description && (
            <p className="text-xl text-gray-700 mb-1">{description}</p>
          )}
          <p className="text-sm text-gray-500">Requested by {businessName}</p>
        </div>

        {/* Primary CTA */}
        <div className="mb-8">
          <button
            type="button"
            onClick={openProvider}
            disabled={opening}
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg disabled:opacity-60"
          >
            {opening ? `Opening ${providerName}…` : `Open ${providerName}`}
          </button>
          {opening && (
            <p className="text-center text-sm text-gray-500 mt-2">
              If {providerName} does not open, use the manual steps below.
            </p>
          )}
        </div>

        {/* Payment Details Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Payment Details</h2>
          
          <div className="space-y-4">
            {provider === 'venmo' && venmoUsername && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Recipient</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium">@{venmoUsername}</span>
                  <button
                    onClick={() => copyToClipboard(`@${venmoUsername}`, 'username')}
                    className="p-1.5 hover:bg-gray-100 text-gray-500 rounded transition-colors"
                    title="Copy recipient"
                  >
                    {copied === 'username' ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Amount</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-900 font-medium">{formattedAmount}</span>
                <button
                    onClick={() => copyToClipboard(amount, 'amount')}
                    className="p-1.5 hover:bg-gray-100 text-gray-500 rounded transition-colors"
                    title="Copy amount"
                  >
                    {copied === 'amount' ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
              </div>
            </div>

            {description && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Payment Note</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium text-right max-w-[200px] truncate">{description}</span>
                  <button
                    onClick={() => copyToClipboard(description, 'note')}
                    className="p-1.5 hover:bg-gray-100 text-gray-500 rounded transition-colors"
                    title="Copy note"
                  >
                    {copied === 'note' ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fallback Instructions */}
        {provider === 'venmo' && venmoUsername && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">If {providerName} doesn&rsquo;t open</h2>

            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Open Venmo manually and pay <span className="font-medium text-gray-900">@{venmoUsername}</span>.
              </p>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Venmo username</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium">@{venmoUsername}</span>
                  <button
                    onClick={() => copyToClipboard(`@${venmoUsername}`, 'username-fallback')}
                    className="p-1.5 hover:bg-gray-100 text-gray-500 rounded transition-colors"
                    title="Copy username"
                  >
                    {copied === 'username-fallback' ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {description && (
                <p className="text-sm text-gray-600">
                  Use &ldquo;<span className="font-medium text-gray-900">{description}</span>&rdquo; as the payment note.
                </p>
              )}

              {description && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Payment note</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 font-medium text-right max-w-[180px] truncate">{description}</span>
                    <button
                      onClick={() => copyToClipboard(description, 'note-fallback')}
                      className="p-1.5 hover:bg-gray-100 text-gray-500 rounded transition-colors"
                      title="Copy note"
                    >
                      {copied === 'note-fallback' ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-gray-500 text-center">
          Questions? Reply to the original text message.
        </p>
      </div>
    </div>
  )
}
