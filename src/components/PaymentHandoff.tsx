'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { isPlaceholderValue } from '@/components/payments/customer-search-helpers'

interface PaymentHandoffProps {
  provider: 'venmo' | 'paypal'
  businessName: string
  amount: string
  description?: string | null
  checkoutUrl?: string | null
  venmoUsername?: string
  paypalHandle?: string
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

export default function PaymentHandoff({
  provider,
  businessName,
  amount,
  description,
  checkoutUrl,
  venmoUsername,
  paypalHandle
}: PaymentHandoffProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const providerName = provider === 'venmo' ? 'Venmo' : 'PayPal'
  const amountNumber = parseFloat(amount) || 0
  const formattedAmount = formatCurrency(amountNumber)
  // AI-intake placeholders (e.g. "Not collected") are not real payment notes
  const note = isPlaceholderValue(description) ? null : (description as string)

  const copyButton = (text: string, label: string, title: string) => (
    <button
      type="button"
      onClick={() => copyToClipboard(text, label)}
      className="p-1.5 hover:bg-gray-100 text-gray-500 rounded transition-colors"
      title={title}
    >
      {copied === label ? <CheckIcon /> : <CopyIcon />}
    </button>
  )

  // Recipient as shown inside each provider's app
  const venmoRecipient = venmoUsername ? `@${venmoUsername}` : businessName
  const paypalRecipient = paypalHandle ? `paypal.me/${paypalHandle}` : businessName

  // How-to-pay steps per provider. These are instructions only — the launch UI
  // intentionally does not open the native app or deep-link out (confirmed
  // Android behavior: Venmo app links can hang on a loading spinner).
  const steps: string[] =
    provider === 'venmo'
      ? [
          'Open Venmo on your phone',
          `Send ${formattedAmount} to ${venmoRecipient}`,
          ...(note ? [`Use "${note}" as the payment note`] : []),
        ]
      : [
          'Open PayPal (app or paypal.com)',
          `Send ${formattedAmount} to ${paypalRecipient}`,
          ...(note ? [`Use "${note}" as the payment note`] : []),
        ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-6">
      <div className="max-w-md w-full">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-gray-900 mb-2">{formattedAmount}</h1>
          {note && (
            <p className="text-xl text-gray-700 mb-1">{note}</p>
          )}
          <p className="text-sm text-gray-500">Requested by {businessName}</p>
        </div>

        {/* How to pay */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">How to pay with {providerName}</h2>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-gray-500 mt-4">
            {businessName} will confirm your payment once it arrives.
          </p>
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
                  {copyButton(`@${venmoUsername}`, 'username', 'Copy recipient')}
                </div>
              </div>
            )}

            {provider === 'paypal' && paypalHandle && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Recipient</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium">paypal.me/{paypalHandle}</span>
                  {copyButton(`paypal.me/${paypalHandle}`, 'recipient', 'Copy recipient')}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Amount</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-900 font-medium">{formattedAmount}</span>
                {copyButton(amount, 'amount', 'Copy amount')}
              </div>
            </div>

            {note && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Payment Note</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium text-right max-w-[200px] truncate">{note}</span>
                  {copyButton(note, 'note', 'Copy note')}
                </div>
              </div>
            )}

            {provider === 'paypal' && checkoutUrl && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Payment Link</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium text-right max-w-[200px] truncate">{checkoutUrl}</span>
                  {copyButton(checkoutUrl, 'link', 'Copy link')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-500 text-center">
          Questions? Reply to the original text message.
        </p>
      </div>
    </div>
  )
}
