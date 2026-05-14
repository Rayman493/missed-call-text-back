'use client'

import React, { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { isReadyForForwardingSetup, hasActiveAccess } from '@/lib/subscription-utils'
import { themeClasses, bgTokens, textTokens, borderTokens, buttonTokens } from '@/lib/theme'
import { useRouter } from 'next/navigation'
import { X, CheckCircle2, Copy } from 'lucide-react'

const CARRIERS = [
  { id: 'verizon', name: 'Verizon', code: '*71' },
  { id: 'at&t', name: 'AT&T', code: '*004*', suffix: '#' },
  { id: 't-mobile', name: 'T-Mobile', code: '**21*', suffix: '#' },
  { id: 'other', name: 'Other', code: null }
]

export default function ForwardingSetupModal() {
  const { business, refreshBusiness } = useBusiness()
  const router = useRouter()
  const supabase = createBrowserClient()
  const [selectedCarrier, setSelectedCarrier] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [business_phone_carrierError, setCarrierError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isDismissed, setIsDismissed] = useState(false)

  // Initialize business_phone_carrier from business data if available
  useEffect(() => {
    if (business?.business_phone_carrier && !selectedCarrier) {
      setSelectedCarrier(business.business_phone_carrier)
    }
  }, [business?.business_phone_carrier, selectedCarrier])

  // Reset dismissal state when business state changes significantly
  useEffect(() => {
    if (business && !business.call_forwarding_enabled && !business.phone_setup_completed_at && !business.forwarding_verified) {
      setIsDismissed(false)
    }
  }, [business?.call_forwarding_enabled, business?.phone_setup_completed_at, business?.forwarding_verified, business?.subscription_status])

  // Also reset dismissal when subscription becomes active
  useEffect(() => {
    if (business && (business.subscription_status === 'trialing' || business.subscription_status === 'active')) {
      setIsDismissed(false)
    }
  }, [business?.subscription_status])

  // Check if modal should show
  const shouldShow = isReadyForForwardingSetup(business) && !isDismissed

  // Don't show modal if business data is still loading
  if (!business || !business.subscription_status) {
    return null
  }

  // Don't show modal if forwarding is already enabled or onboarding is in test/complete state
  if (business.call_forwarding_enabled || business.onboarding_status === 'pending_test' || business.onboarding_status === 'complete') {
    return null
  }

  if (!shouldShow) {
    return null
  }

  // Dev-only debug log (only when modal is actually about to render)
  if (process.env.NODE_ENV === 'development') {
    console.log('[ForwardingSetupModal] Rendering for business', business.id, {
      subscription_status: business?.subscription_status,
      hasActiveAccess: hasActiveAccess(business),
    })
  }

  const handleCopyCode = () => {
    const code = getForwardingCode()
    if (code && code !== 'Contact your business_phone_carrier to enable call forwarding') {
      navigator.clipboard.writeText(code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  // Returns the raw dial-code string used for the clipboard / actual dialing,
  // e.g. '*71 12184236763' or '*004*12184236763#'
  const getForwardingCode = () => {
    if (!business?.twilio_phone_number) return ''
    const business_phone_carrier = CARRIERS.find(c => c.id === selectedCarrier)
    if (!business_phone_carrier || !business_phone_carrier.code) return 'Contact your business_phone_carrier to enable call forwarding'

    const phoneNumber = business.twilio_phone_number.replace(/^\+/, '')
    const code = business_phone_carrier.code + ' ' + phoneNumber
    return business_phone_carrier.suffix ? code + business_phone_carrier.suffix : code
  }

  // Returns the human-readable display form, e.g. '*71 1 (218) 423-6763'
  // so non-technical users can verify each digit at a glance.
  const getForwardingCodeDisplay = () => {
    if (!business?.twilio_phone_number) return ''
    const business_phone_carrier = CARRIERS.find(c => c.id === selectedCarrier)
    if (!business_phone_carrier || !business_phone_carrier.code) return ''

    const formattedNumber = formatPhoneNumber(business.twilio_phone_number)
    const code = `${business_phone_carrier.code} ${formattedNumber}`
    return business_phone_carrier.suffix ? code + business_phone_carrier.suffix : code
  }

  const hasValidCode = Boolean(
    selectedCarrier &&
    business?.twilio_phone_number &&
    CARRIERS.find(c => c.id === selectedCarrier)?.code
  )

  const handleCompleteSetup = async () => {
    if (!business) return
    if (!selectedCarrier) {
      setCarrierError('Please select your carrier.')
      return
    }

    setCarrierError('')
    setSaveError('')
    setLoading(true)
    
    // Optimistic UI update - show success immediately
    setShowSuccess(true)

    try {
      console.log('[ForwardingSetup] Starting setup completion...')
      console.log('[ForwardingSetup] Update payload:', {
        business_id: business.id,
        call_forwarding_enabled: true,
        business_phone_carrier: selectedCarrier,
        phone_setup_completed_at: new Date().toISOString(),
        onboarding_status: 'pending_test'
      })
      
      // Update Supabase with forwarding enabled and business_phone_carrier
      const { error } = await supabase
        .from('businesses')
        .update({
          id: business.id,
          call_forwarding_enabled: true,
          call_forwarding_status: "enabled",
          business_phone_carrier: selectedCarrier,
          phone_setup_completed_at: new Date().toISOString(),
          onboarding_status: "pending_test"
        })
        .eq('id', business.id)

      if (error) {
        console.error('[ForwardingSetup] Supabase update failed:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          attemptedUpdate: {
            business_id: business.id,
            call_forwarding_enabled: true,
            business_phone_carrier: selectedCarrier,
            phone_setup_completed_at: new Date().toISOString(),
            onboarding_status: 'pending_test'
          }
        })
        setSaveError(`Failed to save. ${error.message || 'Unknown error'} (Code: ${error.code || 'N/A'})`)
        // Revert optimistic UI update on error
        setShowSuccess(false)
      } else {
        console.log('[ForwardingSetup] Setup completed successfully')
        
        // Update local business state immediately to prevent modal from reopening
        await refreshBusiness()
        
        // Close modal after successful update
        setTimeout(() => {
          router.push('/dashboard/test-setup')
        }, 1500)
      }
    } catch (error) {
      console.error('[ForwardingSetup] Failed to complete setup:', error)
      setSaveError('Failed to save. Please try again.')
      // Revert optimistic UI update on error
      setShowSuccess(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Connect your business phone</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Forward missed calls to ReplyFlow so we can text customers back automatically.
            </p>
          </div>
          <button
            onClick={() => {
              // Allow user to dismiss modal without marking setup complete
              setIsDismissed(true)
            }}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* ReplyFlow Number - Secondary */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Your ReplyFlow forwarding number:</p>
            <div className="flex items-center gap-3">
              <p className="text-xl font-mono text-slate-900 dark:text-white">
                {formatPhoneNumber(business.twilio_phone_number)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                (This number is included in the dial code below)
              </p>
            </div>
          </div>

          {/* Carrier Selection */}
          <div>
            <p className="font-medium text-slate-900 dark:text-white">Which carrier does your business phone use?</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-3">
              Choose the provider for the phone number your customers call.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {CARRIERS.map(business_phone_carrier => {
                const isSelected = selectedCarrier === business_phone_carrier.id
                return (
                  <button
                    key={business_phone_carrier.id}
                    onClick={() => setSelectedCarrier(business_phone_carrier.id)}
                    aria-pressed={isSelected}
                    className={`group relative p-3.5 rounded-xl border text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-sm ring-1 ring-blue-500/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-base font-semibold ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'}`}>
                        {business_phone_carrier.name}
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Forwarding Instructions - dedicated dial code card */}
          {selectedCarrier && (
            <div className="space-y-5">
              {hasValidCode ? (
                <div className="bg-white dark:bg-slate-800/40 border-2 border-blue-200 dark:border-blue-700/50 rounded-2xl p-5 sm:p-6 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-3 text-center">
                    Dial this exact code
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-5 sm:py-6 mb-4 overflow-x-auto">
                    <code
                      aria-label="Forwarding dial code"
                      className="block font-mono font-semibold text-slate-900 dark:text-white text-center text-2xl sm:text-3xl lg:text-4xl tracking-wider whitespace-nowrap select-all"
                    >
                      {getForwardingCodeDisplay()}
                    </code>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-all ${
                      copiedCode
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    {copiedCode ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy code
                      </>
                    )}
                  </button>
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-3">
                    Open your phone app and dial this exactly as shown.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
                  Contact your carrier to learn how to forward unanswered calls to{' '}
                  <span className="font-mono font-semibold">{formatPhoneNumber(business.twilio_phone_number)}</span>.
                </div>
              )}

              {/* What happens next */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 mt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-3">
                  What happens after you dial
                </p>
                <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    Your phone still rings normally
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    ReplyFlow texts customers who call when you don’t answer
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    Takes about 30 seconds — nothing else to install
                  </li>
                </ul>
              </div>

              {/* Help link */}
              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                Not sure how call forwarding works?{' '}
                <a
                  href="/faq#forwarding"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  See the quick guide
                </a>
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {business_phone_carrierError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 transition-all duration-300 ease-in-out">
                <p className="text-sm text-red-600 dark:text-red-400">{business_phone_carrierError}</p>
              </div>
            )}

            {saveError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 transition-all duration-300 ease-in-out">
                <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
              </div>
            )}

            {showSuccess && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 transition-all duration-300 ease-in-out">
                <p className="text-sm text-green-600 dark:text-green-400">Forwarding marked as enabled. Now let’s test your setup…</p>
              </div>
            )}

            <button
              onClick={handleCompleteSetup}
              disabled={loading || !selectedCarrier}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white w-full py-3 font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  I Enabled Forwarding
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
