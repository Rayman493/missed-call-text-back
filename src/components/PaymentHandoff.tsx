'use client'

import { useEffect, useRef, useState } from 'react'
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
  const openTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (openTimeout.current) clearTimeout(openTimeout.current)
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
  // - On native (Capacitor), use Browser.open() which launches the system browser
  //   (Chrome Custom Tab on Android, Safari View Controller on iOS). The system
  //   browser then opens Venmo/PayPal via Universal Links / App Links, keeping
  //   ReplyFlow in the background. This avoids the WebView's target="_blank"
  //   handling which can bounce back to the payment page.
  // - On web, use the real checkoutUrl (not a hard-coded homepage) so the
  //   merchant's profile opens directly.
  const openProvider = async () => {
    const url = checkoutUrl || (provider === 'venmo' ? 'https://venmo.com' : '#')
    if (!url || url === '#') return

    setOpening(true)
    if (openTimeout.current) clearTimeout(openTimeout.current)

    try {
      if (Capacitor.isNativePlatform()) {
        // Browser.open launches Chrome Custom Tab / SFSafariViewController;
        // the system then resolves the Universal/App Link to Venmo if installed.
        await Browser.open({ url })
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      console.error(`[${providerName} HANDOFF] Failed to open:`, e)
    }

    // Clear the pressed state after a short window; the OS handoff is async
    // and Browser.open does not reliably report whether the app launched.
    openTimeout.current = setTimeout(() => setOpening(false), 2500)
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
