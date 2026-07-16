'use client'

import { useState } from 'react'

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const providerName = provider === 'venmo' ? 'Venmo' : 'PayPal'
  const providerColor = provider === 'venmo' ? 'bg-blue-500' : 'bg-blue-600'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${providerColor} mb-4`}>
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              {provider === 'venmo' ? (
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
              ) : (
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
              )}
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Pay with {providerName}</h1>
          <p className="text-gray-600">
            {businessName} is requesting a payment via {providerName}
          </p>
        </div>

        {provider === 'venmo' && venmoUsername && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="text-sm font-medium text-blue-900 mb-3">Send to</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-blue-200 rounded px-3 py-2">
                <code className="text-blue-900 font-mono text-sm">@{venmoUsername}</code>
              </div>
              <button
                onClick={() => copyToClipboard(`@${venmoUsername}`, 'username')}
                className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                title="Copy username"
              >
                {copied === 'username' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-medium">Amount</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">${amount}</span>
              <button
                onClick={() => copyToClipboard(amount, 'amount')}
                className="p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors"
                title="Copy amount"
              >
                {copied === 'amount' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div className="mt-3">
              <div className="text-sm font-medium text-gray-600 mb-2">Payment note</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white border border-gray-200 rounded px-3 py-2">
                  <span className="text-gray-900 text-sm">{description}</span>
                </div>
                <button
                  onClick={() => copyToClipboard(description, 'note')}
                  className="p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors"
                  title="Copy note"
                >
                  {copied === 'note' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        <div className="space-y-3 mb-6">
          <a
            href={provider === 'venmo' ? 'https://venmo.com' : (checkoutUrl || '#')}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            {provider === 'venmo' ? 'Open Venmo' : 'Open in PayPal'}
          </a>
        </div>

        {provider === 'venmo' && (
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 mb-4">
            <p className="text-gray-600">
              Venmo may not open directly to the business profile. Use the payment details above to complete your payment.
            </p>
          </div>
        )}

        {provider === 'venmo' && venmoUsername && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
            <div className="font-medium mb-2">Payment Instructions:</div>
            <p className="text-yellow-800">
              In Venmo, confirm the recipient <strong>@{venmoUsername}</strong>, enter <strong>${amount}</strong>, and use <strong>"{description}"</strong> as the payment note.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500 text-center mt-6">
          This is an external payment method. {businessName} will confirm payment manually.
        </p>
      </div>
    </div>
  )
}
