'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { isReadyForForwardingSetup, hasActiveAccess, deriveSetupState } from '@/lib/subscription-utils'
import { X, CheckCircle2, Copy, Phone, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'

const CARRIERS = [
  { id: 'verizon', name: 'Verizon', noAnswerCode: '*71', noAnswerDelay: '30' },
  { id: 'at&t', name: 'AT&T', noAnswerCode: '*004*', noAnswerSuffix: '#', noAnswerDelay: '30' },
  { id: 't-mobile', name: 'T-Mobile', noAnswerCode: '**61*', noAnswerSuffix: '#', noAnswerDelay: '30' },
  { id: 'other', name: 'Other', noAnswerCode: null }
]

export default function PhoneForwardingPage() {
  const { business, refreshBusiness } = useBusiness()
  const router = useRouter()
  const supabase = createBrowserClient()
  
  // All hooks must be called before any early returns
  const [selectedCarrier, setSelectedCarrier] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [carrierError, setCarrierError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [ctaHighlighted, setCtaHighlighted] = useState(false)
  const [forwardingCompleted, setForwardingCompleted] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // Initialize business_phone_carrier from business data if available
  useEffect(() => {
    if (business?.business_phone_carrier && !selectedCarrier) {
      setSelectedCarrier(business.business_phone_carrier)
    }
  }, [business?.business_phone_carrier, selectedCarrier])
  
  console.log('[Phone Forwarding Route] Component mounted')
  console.log('[Phone Forwarding Route] Current pathname:', typeof window !== 'undefined' ? window.location.pathname : 'unknown')

  // HARD GUARD: Check subscription status BEFORE any UI rendering
  // This prevents flash of forwarding UI when subscription is not active
  if (!business) {
    console.log('[Phone Forwarding Route] Business data not loaded - showing loading')
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Loading...</p>
        </div>
      </div>
    )
  }

  console.log('[Phone Forwarding Route] Business state loaded:', {
    id: business.id,
    subscription_status: business.subscription_status,
    twilio_phone_number: business.twilio_phone_number,
    forwarding_verified: business.forwarding_verified,
  })

  const setupState = deriveSetupState(business)
  console.log('[Phone Forwarding Route] Derived setup state:', setupState)
  console.log('[Phone Forwarding Route] Route decision:', {
    canAccess: setupState === 'needs_forwarding' || setupState === 'needs_final_test',
    reason: setupState === 'needs_trial' ? 'Subscription not active' :
             setupState === 'loading' ? 'Business data not loaded' :
             setupState === 'provisioning_or_number_pending' ? 'Number not ready' :
             setupState === 'complete' ? 'Setup already complete' :
             'Unknown state',
    redirectTarget: '/dashboard'
  })

  // HARD GUARD: If subscription is not active, immediately redirect without rendering any UI
  if (setupState !== 'needs_forwarding' && setupState !== 'needs_final_test') {
    console.log('[Phone Forwarding Route] Blocking access - redirecting to dashboard (no UI rendered)')
    router.replace('/dashboard')
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Loading...</p>
        </div>
      </div>
    )
  }

  console.log('[Phone Forwarding Route] Access granted - rendering forwarding UI')

  const handleCopyCode = () => {
    const code = getForwardingCode()
    if (code && code !== 'Contact your carrier to enable call forwarding') {
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
  // UPDATED: Uses no-answer forwarding codes instead of unconditional forwarding
  const getForwardingCode = () => {
    if (!business?.twilio_phone_number) return ''
    const carrier = CARRIERS.find(c => c.id === selectedCarrier)
    if (!carrier || !carrier.noAnswerCode) return 'Contact your carrier to enable call forwarding'

    const phoneNumber = business.twilio_phone_number.replace(/^\+/, '')
    let code = carrier.noAnswerCode + ' ' + phoneNumber
    
    // Add delay for T-Mobile if specified (seconds before forwarding)
    if (carrier.noAnswerDelay) {
      code = carrier.noAnswerCode + carrier.noAnswerDelay + ' ' + phoneNumber
    }
    
    return carrier.noAnswerSuffix ? code + carrier.noAnswerSuffix : code
  }

  // Returns the human-readable display form, e.g. '*71 (218) 423-6763'
  // so non-technical users can verify each digit at a glance.
  // UPDATED: Uses no-answer forwarding codes instead of unconditional forwarding
  const getForwardingCodeDisplay = () => {
    if (!business?.twilio_phone_number) return ''
    const carrier = CARRIERS.find(c => c.id === selectedCarrier)
    if (!carrier || !carrier.noAnswerCode) return ''

    const formattedNumber = formatPhoneNumber(business.twilio_phone_number)
    let code = `${carrier.noAnswerCode} ${formattedNumber}`
    
    // Add delay for T-Mobile if specified (seconds before forwarding)
    if (carrier.noAnswerDelay) {
      code = `${carrier.noAnswerCode}${carrier.noAnswerDelay} ${formattedNumber}`
    }
    
    return carrier.noAnswerSuffix ? code + carrier.noAnswerSuffix : code
  }

  const hasValidCode = Boolean(
    selectedCarrier &&
    business?.twilio_phone_number &&
    CARRIERS.find(c => c.id === selectedCarrier)?.noAnswerCode
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
      console.log('[Phone Forwarding] User marking forwarding as completed')
      console.log('[Phone Forwarding] Business ID:', business.id)
      console.log('[Phone Forwarding] User ID:', business.user_id)
      console.log('[Phone Forwarding] Selected carrier:', selectedCarrier)
      console.log('[Phone Forwarding] Update payload:', {
        business_id: business.id,
        call_forwarding_enabled: true,
        call_forwarding_status: "enabled",
        business_phone_carrier: selectedCarrier,
        phone_setup_completed_at: new Date().toISOString(),
        onboarding_status: "pending_test",
        onboarding_step: "phone_setup_completed"
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
        console.error('[Phone Forwarding] Supabase update failed:', {
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
        console.log('[Phone Forwarding] Forwarding step marked complete successfully')
        console.log('[Phone Forwarding] Updated onboarding status:', 'pending_test')
        console.log('[Phone Forwarding] Updated phone_setup_completed_at:', new Date().toISOString())
        
        // Show success state
        setForwardingCompleted(true)
        setShowSuccess(true)
        
        // Refresh business context to update state
        await refreshBusiness()
        
        // Redirect to test setup after showing success confirmation
        setTimeout(() => {
          console.log('[Phone Forwarding] Navigating to final test step')
          router.push('/dashboard/test-setup')
        }, 1500)
      }
    } catch (error) {
      console.error('[Phone Forwarding] Failed to complete setup:', error)
      setSaveError('Failed to save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthGuard>
      <BusinessGuard>
        <div className="min-h-screen bg-background p-4 sm:p-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <Link 
                href="/dashboard" 
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Replace voicemail with AI
              </h1>
              <p className="text-muted-foreground">
                ReplyFlow answers missed calls instead of voicemail and texts customers back instantly.
              </p>
            </div>

            {/* Progress indicator */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">Step 3 of 4</p>
                <p className="text-xs text-muted-foreground">Almost ready — about 1 minute left</p>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: '75%' }}></div>
              </div>
            </div>

            {/* Main card */}
            <div className="bg-card rounded-xl shadow-lg p-6 sm:p-8 mb-8 border border-border min-h-[600px]">
              {/* Error message */}
              {carrierError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-red-600 dark:text-red-400">{carrierError}</p>
                </div>
              )}

              {saveError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
                </div>
              )}

              {/* ReplyFlow Number */}
              <div className="bg-muted border border-border rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Your AI voicemail replacement number:</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                    Replaces your voicemail
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-2xl font-mono font-semibold text-foreground">
                    {formatPhoneNumber(business?.twilio_phone_number)}
                  </p>
                </div>
              </div>

              {/* Carrier Selection */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                    Step 1
                  </span>
                  <p className="font-medium text-foreground">Choose your carrier</p>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Select the provider for your business phone number.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {CARRIERS.map(carrier => {
                    const isSelected = selectedCarrier === carrier.id
                    return (
                      <button
                        key={carrier.id}
                        onClick={() => setSelectedCarrier(carrier.id)}
                        aria-pressed={isSelected}
                        className={`group relative p-4 rounded-xl border text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                          isSelected
                            ? 'border-2 border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 shadow-sm ring-2 ring-blue-500/20'
                            : 'border-border bg-card hover:border-slate-300 dark:hover:border-slate-500 hover:bg-muted'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className={`text-base font-semibold ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'}`}>
                            {carrier.name}
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Placeholder when no carrier selected */}
              {!selectedCarrier && (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center mb-6">
                  <Phone className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Select your carrier to see your connection code
                  </p>
                </div>
              )}

              {/* Connection Instructions */}
              {selectedCarrier && (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      Step 2
                    </span>
                    <p className="font-medium text-foreground">Dial your forwarding code</p>
                  </div>
                  {hasValidCode ? (
                    <div className="bg-card border border-blue-200/60 dark:border-blue-700/30 rounded-2xl p-4 sm:p-6 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-3 text-center">
                        Dial this exact code
                      </p>
                      <div 
                        className="bg-muted border border-border rounded-xl px-4 py-4 sm:py-6 mb-4 overflow-x-auto cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={handleCopyCode}
                        title="Click to copy code"
                      >
                        <code
                          aria-label="Connection dial code"
                          className="block font-mono font-semibold text-foreground text-center text-2xl sm:text-3xl lg:text-4xl tracking-widest whitespace-nowrap select-all"
                        >
                          {getForwardingCodeDisplay()}
                        </code>
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg border transition-all ${
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
                      <p className="text-[11px] text-muted-foreground/70 text-center mt-3">
                        Open your phone app and dial this exactly as shown.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
                      Contact your carrier to learn how to forward unanswered calls to{' '}
                      <span className="font-mono font-semibold">{formatPhoneNumber(business?.twilio_phone_number)}</span>.
                    </div>
                  )}

                  {/* What happens next */}
                  <div className="bg-blue-50/50 dark:bg-blue-900/15 border border-blue-200/60 dark:border-blue-800/40 rounded-xl p-4 mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600/70 dark:text-blue-400/70 mb-2">
                      What happens after you dial
                    </p>
                    <ul className="space-y-1 text-sm text-muted-foreground/80">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400 flex-shrink-0" />
                        Your phone still rings normally first
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        ReplyFlow answers missed calls instead of voicemail
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400 flex-shrink-0" />
                        AI collects information and texts customers back
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

                  {/* Helper text */}
                  <div className="text-center mb-3">
                    <p className="text-sm text-muted-foreground">
                      Once you've dialed the code on your business phone, press Continue.
                    </p>
                  </div>

                  {/* Info section */}
                  <div className="bg-muted/50 border border-border rounded-xl p-3">
                    <p className="text-xs text-muted-foreground text-center">
                      You can disable forwarding anytime from your carrier settings.
                    </p>
                  </div>
                </div>
              )}

              {/* Success Confirmation */}
              {showSuccess && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 mb-6 mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-700 dark:text-green-300 text-base">
                        Forwarding enabled successfully!
                      </p>
                      <p className="text-sm text-green-600/80 dark:text-green-400/80">
                        Redirecting to final test step...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="mt-8 space-y-3">
                <button
                  onClick={handleCompleteSetup}
                  disabled={loading || forwardingCompleted}
                  className={`w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-400/50 text-white font-semibold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-2 ${
                    loading ? 'opacity-70 cursor-not-allowed' : forwardingCompleted ? 'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600' : 'hover:shadow-lg'
                  } ${ctaHighlighted ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-white dark:ring-offset-card' : ''}`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : forwardingCompleted ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Forwarding enabled
                    </>
                  ) : (
                    <>
                      I've enabled call forwarding
                    </>
                  )}
                </button>
                <p className="text-xs text-center text-muted-foreground">
                  {forwardingCompleted ? 'Proceeding to final test step...' : 'Only click after you\'ve dialed the code on your phone'}
                </p>
              </div>
            </div>

            {/* Finish later link */}
            <div className="text-center">
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Finish later
              </Link>
            </div>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
