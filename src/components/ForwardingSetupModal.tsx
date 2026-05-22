'use client'

import React, { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { isReadyForForwardingSetup, hasActiveAccess } from '@/lib/subscription-utils'
import { themeClasses, bgTokens, textTokens, borderTokens, buttonTokens } from '@/lib/theme'
import { useRouter } from 'next/navigation'
import { X, CheckCircle2, Copy, Phone, ChevronRight } from 'lucide-react'

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
  const [showQuickGuide, setShowQuickGuide] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [ctaHighlighted, setCtaHighlighted] = useState(false)
  const step2Ref = React.useRef<HTMLDivElement>(null)

  // Initialize business_phone_carrier from business data if available
  useEffect(() => {
    if (business?.business_phone_carrier && !selectedCarrier) {
      setSelectedCarrier(business.business_phone_carrier)
    }
  }, [business?.business_phone_carrier, selectedCarrier])

  // Animate expansion when carrier is selected
  useEffect(() => {
    if (selectedCarrier) {
      setIsExpanded(true)
      // Auto-scroll to Step 2 when carrier is selected
      setTimeout(() => {
        step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    } else {
      setIsExpanded(false)
    }
  }, [selectedCarrier])

  // Reset dismissal state when business state changes significantly
  useEffect(() => {
    if (business && !business.call_forwarding_enabled && !business.phone_setup_completed_at && !business.forwarding_verified) {
      setIsDismissed(false)
    }
  }, [business?.call_forwarding_enabled, business?.phone_setup_completed_at, business?.forwarding_verified, business?.subscription_status])

  // Also reset dismissal when subscription becomes active
  useEffect(() => {
    if (business && hasActiveAccess(business)) {
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
      // Highlight CTA briefly
      setCtaHighlighted(true)
      setTimeout(() => {
        setCopiedCode(false)
        setCtaHighlighted(false)
      }, 2000)
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

  // Returns the human-readable display form, e.g. '*71 (218) 423-6763'
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
          onboarding_status: "pending_test",
          onboarding_step: "phone_setup_completed"
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
      } else {
        console.log('[ForwardingSetup] Setup completed successfully')

        // Redirect immediately to test setup without showing success state
        // This prevents dashboard flash and provides smooth transition
        router.push('/dashboard/test-setup')
      }
    } catch (error) {
      console.error('[ForwardingSetup] Failed to complete setup:', error)
      setSaveError('Failed to save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/10 dark:shadow-black/30">
        {/* Header */}
        <div className="sticky top-0 bg-card border border-border p-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1.5">Connect your business phone</h2>
            <p className="text-muted-foreground text-sm">
              Forward missed calls to ReplyFlow so we can text customers back automatically.
            </p>
          </div>
          <button
            onClick={() => {
              // Allow user to dismiss modal without marking setup complete
              setIsDismissed(true)
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* ReplyFlow Number - Secondary */}
          <div className="bg-muted border border-border rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-muted-foreground">Your ReplyFlow forwarding number:</p>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                Dedicated ReplyFlow number
              </span>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-mono font-semibold text-foreground">
                {formatPhoneNumber(business.twilio_phone_number)}
              </p>
            </div>
          </div>

          {/* Carrier Selection */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                Step 1
              </span>
              <p className="font-medium text-foreground">Choose your carrier</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Select the provider for your business phone number.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {CARRIERS.map(business_phone_carrier => {
                const isSelected = selectedCarrier === business_phone_carrier.id
                return (
                  <button
                    key={business_phone_carrier.id}
                    onClick={() => setSelectedCarrier(business_phone_carrier.id)}
                    aria-pressed={isSelected}
                    className={`group relative p-3.5 rounded-xl border text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                      isSelected
                        ? 'border-2 border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 shadow-sm ring-2 ring-blue-500/20'
                        : 'border-border bg-card hover:border-slate-300 dark:hover:border-slate-500 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-base font-semibold ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'}`}>
                        {business_phone_carrier.name}
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Placeholder when no carrier selected */}
          {!selectedCarrier && (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
              <Phone className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Select your carrier to see your forwarding code
              </p>
            </div>
          )}

          {/* Forwarding Instructions - dedicated dial code card */}
          {selectedCarrier && (
            <div 
              className={`space-y-5 transition-all duration-300 ease-out ${
                isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                  Step 2
                </span>
                <p className="font-medium text-foreground">Dial your forwarding code</p>
              </div>
              {hasValidCode ? (
                <div className="bg-card border border-blue-200/60 dark:border-blue-700/30 rounded-2xl p-3.5 sm:p-4.5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-2.5 text-center">
                    Dial this exact code
                  </p>
                  <div 
                    className="bg-muted border border-border rounded-xl px-4 py-3.5 sm:py-4.5 mb-3 overflow-x-auto cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={handleCopyCode}
                    title="Click to copy code"
                  >
                    <code
                      aria-label="Forwarding dial code"
                      className="block font-mono font-semibold text-foreground text-center text-2xl sm:text-3xl lg:text-4xl tracking-widest whitespace-nowrap select-all"
                    >
                      {getForwardingCodeDisplay()}
                    </code>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
                      copiedCode
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                        : 'bg-transparent dark:bg-transparent border-border text-muted-foreground hover:bg-muted hover:border-slate-300 dark:hover:border-slate-500'
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
                  <p className="text-[11px] text-muted-foreground/70 text-center mt-2">
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
              <div className="bg-blue-50/50 dark:bg-blue-900/15 border border-blue-200/60 dark:border-blue-800/40 rounded-xl p-4" ref={step2Ref}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600/70 dark:text-blue-400/70 mb-2">
                  What happens after you dial
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground/80">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400 flex-shrink-0" />
                    Your phone still rings normally
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    ReplyFlow texts customers who call when you don't answer
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400 flex-shrink-0" />
                    Takes about 30 seconds — nothing else to install
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    Your carrier may confirm the forwarding number out loud
                  </li>
                </ul>
              </div>

              {/* Help link */}
              <p className="text-xs text-center text-muted-foreground">
                Not sure how call forwarding works?{' '}
                <button
                  onClick={() => setShowQuickGuide(true)}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  See the quick guide
                </button>
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5">
            {business_phone_carrierError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5 transition-all duration-300 ease-in-out">
                <p className="text-sm text-red-600 dark:text-red-400">{business_phone_carrierError}</p>
              </div>
            )}

            {saveError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5 transition-all duration-300 ease-in-out">
                <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
              </div>
            )}

            <button
              onClick={handleCompleteSetup}
              disabled={loading}
              className={`w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-400/50 text-white font-semibold py-3 sm:py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-2 ${
                loading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-lg'
              } ${ctaHighlighted ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-white dark:ring-offset-card' : ''}`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Checking setup...
                </>
              ) : 'Continue to Test Setup'}
            </button>
            <p className="text-xs text-center text-muted-foreground mt-2">
              Usually takes less than 30 seconds.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Guide Modal */}
      {showQuickGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-card rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Call Forwarding Quick Guide</h3>
              <button
                onClick={() => setShowQuickGuide(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm text-foreground">
              <p>Call forwarding redirects unanswered calls from your business phone to your ReplyFlow number. When customers call and you don't answer, ReplyFlow automatically sends them a text message.</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-semibold text-xs flex-shrink-0">1</div>
                  <p>Select your carrier above to get the correct dial code.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-semibold text-xs flex-shrink-0">2</div>
                  <p>Open your phone app and dial the code exactly as shown.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-semibold text-xs flex-shrink-0">3</div>
                  <p>Wait for the confirmation tone (usually 2 beeps).</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-semibold text-xs flex-shrink-0">4</div>
                  <p>Click "I Enabled Forwarding" to complete setup.</p>
                </div>
              </div>
              <div className="bg-muted border border-border rounded-lg p-3 mt-4">
                <p className="font-medium text-foreground mb-1">Important notes:</p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li>• Your phone still rings normally — forwarding only activates when you don't answer</li>
                  <li>• Setup takes about 30 seconds</li>
                  <li>• You can disable forwarding anytime by dialing your carrier's deactivation code</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
