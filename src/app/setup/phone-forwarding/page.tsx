'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { isReadyForForwardingSetup, hasActiveAccess, deriveSetupState } from '@/lib/subscription-utils'
import { X, CheckCircle2, Copy, Phone, ArrowLeft, ChevronDown, Info } from 'lucide-react'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'

const CARRIERS = [
  { id: 'verizon', name: 'Verizon', noAnswerCode: '*71', requiresLeadingOne: false, deactivationCode: '*73' },
  { id: 'at&t', name: 'AT&T', noAnswerCode: '*92', requiresLeadingOne: false, deactivationCode: '*93' },
  { id: 't-mobile', name: 'T-Mobile', noAnswerCode: '*61*', noAnswerSuffix: '**20#', deactivationCode: '##61#' },
  { id: 'other', name: 'Other', noAnswerCode: null }
]

export default function PhoneForwardingPage() {
  const { business, refreshBusiness } = useBusiness()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createBrowserClient()

  // Check if in review mode
  const isReviewMode = searchParams?.get('mode') === 'review'

  // All hooks must be called before any early returns
  const [selectedCarrier, setSelectedCarrier] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [carrierError, setCarrierError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [ctaHighlighted, setCtaHighlighted] = useState(false)
  const [forwardingCompleted, setForwardingCompleted] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showHelpSection, setShowHelpSection] = useState(false)
  const [showTroubleshooting, setShowTroubleshooting] = useState(false)

  // Initialize business_phone_carrier from business data if available
  useEffect(() => {
    if (business?.business_phone_carrier && !selectedCarrier) {
      setSelectedCarrier(business.business_phone_carrier)
    }
  }, [business?.business_phone_carrier, selectedCarrier])

  // HARD GUARD: Check subscription status BEFORE any UI rendering
  // This prevents flash of forwarding UI when subscription is not active
  if (!business) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Loading...</p>
        </div>
      </div>
    )
  }

  const setupState = deriveSetupState(business)

  // HARD GUARD: If subscription is not active, immediately redirect without rendering any UI
  // REVIEW MODE EXCEPTION: Allow access when mode=review is present, regardless of setup state
  if (!isReviewMode && setupState !== 'needs_forwarding' && setupState !== 'needs_final_test') {
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
  // e.g. '*719452708121' or '*619452708121**20#'
  // UPDATED: Uses verified no-answer forwarding codes
  const getForwardingCode = () => {
    if (!business?.twilio_phone_number) return ''
    const carrier = CARRIERS.find(c => c.id === selectedCarrier)
    if (!carrier || !carrier.noAnswerCode) return 'Contact your carrier to enable call forwarding'

    const phoneNumber = business.twilio_phone_number.replace(/^\+/, '')
    
    // Handle different carrier formats for no-answer forwarding
    let code = ''
    if (carrier.id === 'verizon') {
      // Verizon: *71 + 10-digit number (no leading 1, no trailing #)
      // Conditional forwarding for no-answer/busy
      code = carrier.noAnswerCode + phoneNumber
    } else if (carrier.id === 'at&t') {
      // AT&T: *92 + 10-digit number (no leading 1, no trailing #)
      code = carrier.noAnswerCode + phoneNumber
    } else if (carrier.id === 't-mobile') {
      // T-Mobile: *61* + number + **20# (GSM standard for conditional forwarding with 20s delay)
      // Format: *61*number**seconds# where seconds is the delay before forwarding
      code = carrier.noAnswerCode + phoneNumber + carrier.noAnswerSuffix
    } else {
      // Default format for other carriers
      code = carrier.noAnswerCode + phoneNumber
    }
    
    return code
  }

  // Returns the human-readable display form, e.g. '*71 945-270-8121'
  // so non-technical users can verify each digit at a glance.
  // UPDATED: Uses verified no-answer forwarding codes with compact formatting
  const getForwardingCodeDisplay = () => {
    if (!business?.twilio_phone_number) return ''
    const carrier = CARRIERS.find(c => c.id === selectedCarrier)
    if (!carrier || !carrier.noAnswerCode) return ''

    const phoneNumber = business.twilio_phone_number.replace(/^\+/, '')
    
    // Format phone number as XXX-XXX-XXXX (compact, no parentheses)
    let formattedNumber = ''
    if (phoneNumber.length === 11) {
      const digits = phoneNumber.substring(1)
      formattedNumber = `${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6, 10)}`
    } else if (phoneNumber.length === 10) {
      formattedNumber = `${phoneNumber.substring(0, 3)}-${phoneNumber.substring(3, 6)}-${phoneNumber.substring(6, 10)}`
    } else {
      formattedNumber = phoneNumber
    }
    
    // Handle different carrier formats for no-answer forwarding
    let code = ''
    if (carrier.id === 'verizon') {
      // Verizon: *71 + 10-digit number (no leading 1, no trailing #)
      code = carrier.noAnswerCode + ' ' + formattedNumber
    } else if (carrier.id === 'at&t') {
      // AT&T: *92 + 10-digit number (no leading 1, no trailing #)
      code = carrier.noAnswerCode + ' ' + formattedNumber
    } else if (carrier.id === 't-mobile') {
      // T-Mobile: *61* + number + **20# (GSM standard for conditional forwarding with 20s delay)
      // Display as one uninterrupted string
      code = carrier.noAnswerCode + phoneNumber + carrier.noAnswerSuffix
    } else {
      // Default format for other carriers
      code = `${carrier.noAnswerCode} ${formattedNumber}`
    }
    
    return code
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
          forwarding_verified: true,
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
        
        // Force refresh business context to get latest state (bypasses cache)
        await refreshBusiness(true)
        
        // Invalidate Next.js cache to ensure fresh data
        router.refresh()
        
        // Immediately redirect to dashboard to show updated state
        router.push('/dashboard')
      }
    } catch (error) {
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
                {isReviewMode ? 'Review Call Forwarding Setup' : 'Replace voicemail with AI'}
              </h1>
              <p className="text-muted-foreground">
                {isReviewMode
                  ? 'Review and update your call forwarding configuration. Your business phone and ReplyFlow number are shown below.'
                  : 'ReplyFlow answers missed calls instead of voicemail and texts customers back instantly.'}
              </p>
            </div>

            {/* Progress indicator - only show in first-time setup mode */}
            {!isReviewMode && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">Step 2 of 3: Connect Your Business Line</p>
                  <p className="text-xs text-muted-foreground">Almost ready — about 1 minute left</p>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '66%' }}></div>
                </div>
              </div>
            )}

            {/* Main card */}
            <div className="bg-card rounded-xl shadow-lg p-6 sm:p-8 mb-8 border border-border min-h-[600px]">
              {/* Reassuring explanation */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
                <p className="text-sm text-blue-800 dark:text-blue-200 text-center font-medium">
                  Your business phone still rings first. ReplyFlow only answers calls you miss or decline.
                </p>
              </div>

              {/* Error message */}
              {carrierError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-600 dark:text-red-400">{carrierError}</p>
                </div>
              )}

              {saveError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
                </div>
              )}

              {/* ReplyFlow Number - Compact card with reassurance */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Your ReplyFlow Number</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-white dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                    Handles missed calls
                  </span>
                </div>
                <p className="text-2xl font-mono font-bold text-blue-900 dark:text-blue-100 mb-2">
                  {formatPhoneNumber(business?.twilio_phone_number)}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Your business phone still rings first. ReplyFlow only answers calls you miss or decline.
                </p>
              </div>

              {/* Personal phone notice - Collapsible */}
              <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-xl mb-6">
                <button
                  onClick={() => setShowHelpSection(!showHelpSection)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <span className="text-sm font-medium text-slate-900 dark:text-foreground">Using a personal phone for business?</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-600 dark:text-slate-400 transition-transform ${showHelpSection ? 'rotate-180' : ''}`} />
                </button>
                {showHelpSection && (
                  <div className="px-4 pb-4 pt-0 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="text-xs text-slate-700 dark:text-slate-300 mb-3">
                      If you use one phone for both business and personal calls, add personal contacts to Ignored Contacts so ReplyFlow stays out of those conversations.
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-slate-600 dark:text-slate-400 font-semibold text-xs">•</span>
                        <p className="text-xs text-slate-700 dark:text-slate-300"><strong>Not on Ignored Contacts:</strong> ReplyFlow treats missed calls as potential customers.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-slate-600 dark:text-slate-400 font-semibold text-xs">•</span>
                        <p className="text-xs text-slate-700 dark:text-slate-300"><strong>On Ignored Contacts:</strong> ReplyFlow stays out of the conversation.</p>
                      </div>
                    </div>
                  </div>
                )}
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
                  Select the company that provides your business phone service.
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
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      Step 2
                    </span>
                    <p className="font-medium text-foreground">Set up call forwarding</p>
                  </div>
                  {hasValidCode ? (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-2 border-blue-200 dark:border-blue-700 rounded-2xl p-6 sm:p-8 shadow-lg">
                      <p className="text-sm font-semibold text-foreground mb-1">{CARRIERS.find(c => c.id === selectedCarrier)?.name}</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Open your phone's dialer, enter the code below, then press Call. You'll hear a confirmation tone or see a message when it's active.
                      </p>
                      <div 
                        className="bg-white dark:bg-slate-800 border-2 border-blue-300 dark:border-blue-600 rounded-xl px-6 py-8 sm:py-10 mb-4 cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
                        onClick={handleCopyCode}
                        title="Click to copy code"
                      >
                        <code
                          aria-label="Connection dial code"
                          className="block font-mono font-bold text-foreground text-center text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-normal break-words leading-relaxed"
                        >
                          {getForwardingCodeDisplay()}
                        </code>
                      </div>
                      <p className="text-xs text-muted-foreground/70 text-center mb-4">
                        Wait for the confirmation tone or message.
                      </p>
                      {selectedCarrier === 'at&t' && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Some AT&T plans or devices may use different forwarding methods. Contact AT&T if this code doesn't work.
                          </p>
                        </div>
                      )}
                      {selectedCarrier === 't-mobile' && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
                          <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                            This code forwards unanswered calls after approximately 20 seconds. You can copy and paste it directly into your phone's dialer.
                          </p>
                          <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                            Some T-Mobile plans or devices may use different forwarding methods. Contact T-Mobile if this code doesn't work.
                          </p>
                        </div>
                      )}
                      <div className="flex gap-3 mb-3">
                        <button
                          onClick={handleCopyCode}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg border transition-all ${
                            copiedCode
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                              : 'bg-white dark:bg-slate-800 border-border text-muted-foreground hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-300 dark:hover:border-blue-600'
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
                        <button
                          onClick={() => {
                            const code = getForwardingCode()
                            if (code && code !== 'Contact your carrier to enable call forwarding') {
                              window.location.href = `tel:${code}`
                            }
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg border border-border bg-white dark:bg-slate-800 text-muted-foreground hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all"
                        >
                          <Phone className="w-4 h-4" />
                          Dial
                        </button>
                      </div>
                      {/* Deactivation helper */}
                      {CARRIERS.find(c => c.id === selectedCarrier)?.deactivationCode && (
                        <p className="text-xs text-muted-foreground/60 text-center">
                          To disable later: Dial {CARRIERS.find(c => c.id === selectedCarrier)?.deactivationCode} and press Call.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
                      <p className="font-medium mb-2">For other carriers:</p>
                      <p className="mb-3">
                        Search for your carrier's "conditional call forwarding" or "no answer forwarding" instructions. Forward unanswered or missed calls to{' '}
                        <span className="font-mono font-semibold">{formatPhoneNumber(business?.twilio_phone_number)}</span>.
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        After enabling forwarding, click "I've enabled call forwarding" below to continue setup.
                      </p>
                    </div>
                  )}

                  {/* Collapsible troubleshooting */}
                  <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <button
                      onClick={() => setShowTroubleshooting(!showTroubleshooting)}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors rounded-xl"
                    >
                      <span className="text-sm font-medium text-foreground">Troubleshooting</span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showTroubleshooting ? 'rotate-180' : ''}`} />
                    </button>
                    {showTroubleshooting && (
                      <div className="px-4 pb-4 pt-0 animate-in fade-in slide-in-from-top-2 duration-200">
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span>Verify the forwarding code is correct</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span>Press Call/Send after entering the code</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span>Wait for the carrier confirmation tone or message</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span>Restart your phone if needed</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span>Contact your carrier if activation fails</span>
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
              {!isReviewMode ? (
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
                    {forwardingCompleted
                      ? 'Proceeding to final test step...'
                      : 'Only click after you\'ve dialed the code on your phone'}
                  </p>
                </div>
              ) : (
                <div className="mt-8 space-y-4">
                  {business?.phone_setup_completed_at ? (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <p className="font-semibold text-green-700 dark:text-green-300 text-base">
                          Forwarding Verified
                        </p>
                      </div>
                      <div className="mb-4">
                        <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                          Verified on:
                        </p>
                        <p className="text-sm text-green-600/90 dark:text-green-400/90">
                          {new Date(business.phone_setup_completed_at).toLocaleDateString()} at {new Date(business.phone_setup_completed_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <p className="text-sm text-green-600/80 dark:text-green-400/80 mb-3">
                        ReplyFlow successfully verified your forwarding setup during testing. If you change your carrier settings later, run another test call to confirm everything is still working.
                      </p>
                      <p className="text-xs text-green-600/60 dark:text-green-400/60 mb-4">
                        You only need to verify again if you change your forwarding settings, switch carriers, or experience issues.
                      </p>
                      <Link
                        href="/dashboard/test-setup"
                        className="inline-flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-all"
                      >
                        <Phone className="w-4 h-4" />
                        Verify Again
                      </Link>
                    </div>
                  ) : (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
                      <p className="font-semibold text-amber-700 dark:text-amber-300 text-base mb-2">
                        Forwarding has not been verified yet.
                      </p>
                      <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mb-4">
                        Run a test call to confirm your forwarding setup is working correctly.
                      </p>
                      <Link
                        href="/dashboard/test-setup"
                        className="inline-flex items-center justify-center gap-2 w-full bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white font-semibold py-3 px-6 rounded-lg transition-all"
                      >
                        <Phone className="w-4 h-4" />
                        Run Test Call
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </BusinessGuard>
    </AuthGuard>
  )
}
