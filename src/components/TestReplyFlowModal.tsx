'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Phone, Copy, Check, Loader2, ArrowRight, MessageSquare, User, Sparkles } from 'lucide-react'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber } from '@/lib/utils'

type TestStep = 'intro' | 'testing' | 'success'

interface TestReplyFlowModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function TestReplyFlowModal({ isOpen, onClose }: TestReplyFlowModalProps) {
  const { business } = useBusiness()
  const [step, setStep] = useState<TestStep>('intro')
  const [testStatus, setTestStatus] = useState<'waiting' | 'call_detected' | 'missed_call' | 'sending_text' | 'lead_created'>('waiting')
  const [leadId, setLeadId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('intro')
      setTestStatus('waiting')
      setLeadId(null)
      setCopied(false)
    }
  }, [isOpen])

  // Simulate test progress (in production, this would use realtime/polling)
  const startTest = () => {
    setIsStarting(true)
    setTimeout(() => {
      setIsStarting(false)
      setStep('testing')
      setTestStatus('waiting')

      // Simulate the test sequence
      setTimeout(() => setTestStatus('call_detected'), 2000)
      setTimeout(() => setTestStatus('missed_call'), 4000)
      setTimeout(() => setTestStatus('sending_text'), 6000)
      setTimeout(() => {
        setTestStatus('lead_created')
        setLeadId('test-lead-id')
        setStep('success')
      }, 8000)
    }, 500)
  }

  const copyPhoneNumber = () => {
    if (business?.twilio_phone_number) {
      navigator.clipboard.writeText(business.twilio_phone_number)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!isOpen) return null

  const modalContent = (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full animate-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Step 1: Intro */}
        {step === 'intro' && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Test ReplyFlow</h2>
                <p className="text-sm text-slate-400">Verify your setup in 30 seconds</p>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-300">Your Business Number</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-white">
                    {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not configured'}
                  </span>
                  <button
                    onClick={copyPhoneNumber}
                    className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
                    disabled={!business?.twilio_phone_number}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Call this number from your phone. We'll detect the missed call, create a lead, and send an automated reply.
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-blue-400">1</span>
                </div>
                <p className="text-sm text-slate-300">Call your business number</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-blue-400">2</span>
                </div>
                <p className="text-sm text-slate-300">Let it ring and go to voicemail</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-blue-400">3</span>
                </div>
                <p className="text-sm text-slate-300">Receive automated text reply</p>
              </div>
            </div>

            <button
              onClick={startTest}
              disabled={isStarting || !business?.twilio_phone_number}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4" />
                  Start Test
                </>
              )}
            </button>

            {!business?.twilio_phone_number && (
              <p className="text-xs text-amber-400 text-center mt-3">
                Configure your phone number in settings first
              </p>
            )}
          </div>
        )}

        {/* Step 2: Testing */}
        {step === 'testing' && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                {testStatus === 'waiting' && (
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                )}
                {testStatus === 'call_detected' && (
                  <Phone className="w-8 h-8 text-blue-400 animate-pulse" />
                )}
                {testStatus === 'missed_call' && (
                  <Phone className="w-8 h-8 text-amber-400" />
                )}
                {testStatus === 'sending_text' && (
                  <MessageSquare className="w-8 h-8 text-green-400 animate-pulse" />
                )}
                {testStatus === 'lead_created' && (
                  <Check className="w-8 h-8 text-green-400" />
                )}
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                {testStatus === 'waiting' && 'Waiting for call...'}
                {testStatus === 'call_detected' && 'Call detected!'}
                {testStatus === 'missed_call' && 'Call missed'}
                {testStatus === 'sending_text' && 'Sending reply...'}
                {testStatus === 'lead_created' && 'Lead created!'}
              </h2>
              <p className="text-sm text-slate-400">
                {testStatus === 'waiting' && 'Call your business number to begin'}
                {testStatus === 'call_detected' && 'Detecting call status...'}
                {testStatus === 'missed_call' && 'Preparing automated reply...'}
                {testStatus === 'sending_text' && 'Sending text message...'}
                {testStatus === 'lead_created' && 'Test completed successfully'}
              </p>
            </div>

            {/* Progress indicators */}
            <div className="space-y-3">
              <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                testStatus === 'waiting' ? 'bg-blue-500/10 border border-blue-500/30' : 
                ['call_detected', 'missed_call', 'sending_text', 'lead_created'].includes(testStatus) ? 'bg-green-500/10 border border-green-500/30' : 'bg-slate-800/50 border border-slate-700'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  ['call_detected', 'missed_call', 'sending_text', 'lead_created'].includes(testStatus) ? 'bg-green-500' : 'bg-slate-600'
                }`}>
                  {['call_detected', 'missed_call', 'sending_text', 'lead_created'].includes(testStatus) ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Call detected</p>
                  <p className="text-xs text-slate-400">Incoming call from your phone</p>
                </div>
              </div>

              <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                ['missed_call', 'sending_text', 'lead_created'].includes(testStatus) ? 'bg-green-500/10 border border-green-500/30' : 
                testStatus === 'call_detected' ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-800/50 border border-slate-700'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  ['missed_call', 'sending_text', 'lead_created'].includes(testStatus) ? 'bg-green-500' : 
                  testStatus === 'call_detected' ? 'bg-blue-500' : 'bg-slate-600'
                }`}>
                  {['missed_call', 'sending_text', 'lead_created'].includes(testStatus) ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : testStatus === 'call_detected' ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <Phone className="w-4 h-4 text-white" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Missed call</p>
                  <p className="text-xs text-slate-400">Call went to voicemail</p>
                </div>
              </div>

              <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                ['sending_text', 'lead_created'].includes(testStatus) ? 'bg-green-500/10 border border-green-500/30' : 
                testStatus === 'missed_call' ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-800/50 border border-slate-700'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  ['sending_text', 'lead_created'].includes(testStatus) ? 'bg-green-500' : 
                  testStatus === 'missed_call' ? 'bg-blue-500' : 'bg-slate-600'
                }`}>
                  {['sending_text', 'lead_created'].includes(testStatus) ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : testStatus === 'missed_call' ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-white" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Auto-reply sent</p>
                  <p className="text-xs text-slate-400">Text message dispatched</p>
                </div>
              </div>

              <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                testStatus === 'lead_created' ? 'bg-green-500/10 border border-green-500/30' : 
                testStatus === 'sending_text' ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-slate-800/50 border border-slate-700'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  testStatus === 'lead_created' ? 'bg-green-500' : 
                  testStatus === 'sending_text' ? 'bg-blue-500' : 'bg-slate-600'
                }`}>
                  {testStatus === 'lead_created' ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : testStatus === 'sending_text' ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Lead created</p>
                  <p className="text-xs text-slate-400">New lead added to dashboard</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 'success' && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Test Successful!</h2>
              <p className="text-sm text-slate-400">ReplyFlow is working perfectly</p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">New Lead Created</p>
                  <p className="text-xs text-slate-400">Just now</p>
                </div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                <p className="text-sm text-slate-300">Thanks for calling! We'll get back to you shortly.</p>
              </div>
            </div>

            <p className="text-sm text-slate-400 text-center mb-6">
              Your phone forwarding and auto-reply are configured correctly. You're ready to receive real calls!
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('intro')
                  setTestStatus('waiting')
                  setLeadId(null)
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-colors"
              >
                Test Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
              >
                Done
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
