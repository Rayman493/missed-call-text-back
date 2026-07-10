'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber } from '@/lib/utils'
import { isReadyForForwardingSetup, hasActiveAccess, deriveSetupState } from '@/lib/subscription-utils'
import { X, CheckCircle2, Copy, Phone, ChevronDown, Info } from 'lucide-react'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import BusinessGuard from '@/components/BusinessGuard'
import AppBackButton from '@/components/AppBackButton'

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
  const [showConfirmModal, setShowConfirmModal] = useState(false)

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
              <div className="mb-4">
                <AppBackButton fallbackHref="/dashboard" label="Back" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {isReviewMode ? 'Review Call Forwarding Setup' : 'Set Up Forwarding'}
              </h1>
              <p className="text-muted-foreground">
                {isReviewMode
                  ? 'Review and update your call forwarding configuration.'
                  : 'Forward missed calls to ReplyFlow so your AI receptionist can answer when you can\'t.'}
              </p>
            </div>

            {/* Progress indicator - only show in first-time setup mode */}
            {!isReviewMode && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Step 2 of 3</p>
                    <p className="text-sm font-medium text-foreground">Forward your business number</p>
                  </div>
                  <p className="text-xs text-muted-foreground">About 1 minute left</p>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '66%' }}></div>
                </div>
              </div>
            )}

            {/* Main card */}
            <div className="bg-card rounded-xl shadow-lg p-6 sm:p-8 mb-8 border border-border min-h-[600px]">
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

              {/* ReplyFlow Number - Simplified card */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">Forward this number</p>
                <p className="text-3xl font-mono font-bold text-blue-900 dark:text-blue-100 mb-4">
                  {formatPhoneNumber(business?.twilio_phone_number)}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (business?.twilio_phone_number) {
                        navigator.clipboard.writeText(business.twilio_phone_number)
                        setCopiedCode(true)
                        setTimeout(() => setCopiedCode(false), 2000)
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-slate-700 transition-all"
                  >
                    {copiedCode ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (business?.twilio_phone_number) {
                        window.location.href = `tel:${business.twilio_phone_number}`
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-slate-700 transition-all"
                  >
                    <Phone className="w-4 h-4" />
                    Dial
                  </button>
                </div>
              </div>

              {/* Simple steps */}
              <div className="bg-slate-50 dark:bg-slate-900/30 rounded-xl p-6 mb-6">
                <p className="text-sm font-medium text-foreground mb-4">Simple steps:</p>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-semibold">1</span>
                    <span>Copy or dial the forwarding number above.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-semibold">2</span>
                    <span>Follow your carrier's instructions.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-semibold">3</span>
                    <span>Come back and continue setup.</span>
                  </li>
                </ol>
              </div>

              {/* Carrier Selection - Collapsed by default */}
              <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-xl mb-6">
                <button
                  onClick={() => setShowHelpSection(!showHelpSection)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <span className="text-sm font-medium text-slate-900 dark:text-foreground">How do I forward my calls?</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-600 dark:text-slate-400 transition-transform ${showHelpSection ? 'rotate-180' : ''}`} />
                </button>
                {showHelpSection && (
                  <div className="px-4 pb-4 pt-0 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="mb-4">
                      <p className="text-xs text-muted-foreground mb-3">
                        Select your carrier to see specific forwarding codes and instructions.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {CARRIERS.map(carrier => {
                          const isSelected = selectedCarrier === carrier.id
                          return (
                            <button
                              key={carrier.id}
                              onClick={() => setSelectedCarrier(carrier.id)}
                              aria-pressed={isSelected}
                              className={`group relative p-3 rounded-lg border text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                                isSelected
                                  ? 'border-2 border-blue-500 bg-blue-50/80 dark:bg-blue-900/30 shadow-sm ring-2 ring-blue-500/20'
                                  : 'border-border bg-card hover:border-slate-300 dark:hover:border-slate-500 hover:bg-muted'
                              }`}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <div className={`text-sm font-semibold ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'}`}>
                                  {carrier.name}
                                </div>
                                {isSelected && (
                                  <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {selectedCarrier && hasValidCode && (
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                        <p className="text-sm font-semibold text-foreground mb-2">Dial this from your business phone:</p>
                        <div 
                          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-3 mb-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          onClick={handleCopyCode}
                          title="Click to copy code"
                        >
                          <code
                            aria-label="Connection dial code"
                            className="block font-mono font-bold text-foreground text-center text-lg sm:text-xl tracking-normal break-words"
                          >
                            {getForwardingCodeDisplay()}
                          </code>
                        </div>
                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={handleCopyCode}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                              copiedCode
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                                : 'bg-white dark:bg-slate-800 border-border text-muted-foreground hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-300 dark:hover:border-blue-600'
                            }`}
                          >
                            {copiedCode ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy
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
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-border bg-white dark:bg-slate-800 text-muted-foreground hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all"
                          >
                            <Phone className="w-3 h-3" />
                            Dial
                          </button>
                        </div>
                        {selectedCarrier === 'at&t' && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Some AT&T plans may use different forwarding methods. Contact AT&T if this code doesn't work.
                          </p>
                        )}
                        {selectedCarrier === 't-mobile' && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            This code forwards unanswered calls after approximately 20 seconds. Contact T-Mobile if this code doesn't work.
                          </p>
                        )}
                      </div>
                    )}

                    {selectedCarrier && !hasValidCode && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300">
                        <p className="font-medium mb-1">For other carriers:</p>
                        <p>
                          Search for your carrier's "conditional call forwarding" or "no answer forwarding" instructions. Forward unanswered or missed calls to{' '}
                          <span className="font-mono font-semibold">{formatPhoneNumber(business?.twilio_phone_number)}</span>.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

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
                    onClick={() => setShowConfirmModal(true)}
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
                      : 'Once call forwarding is enabled, continue to the next step.'}
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

        {showConfirmModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">Call forwarding enabled?</h2>
              <p className="text-sm text-muted-foreground mb-6">
                We'll verify everything with one quick test call in the next step.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    setShowConfirmModal(false)
                    handleCompleteSetup()
                  }}
                  className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-sm font-semibold text-white transition-all"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
      </BusinessGuard>
    </AuthGuard>
  )
}
