'use client'

import { useState } from 'react'
import { formatPhoneNumber } from '@/lib/utils'
import { useBusiness } from '@/contexts/BusinessContext'

interface CallForwardingInstructionsProps {
  phoneNumber: string
  isOpen: boolean
  onClose: () => void
}

export default function CallForwardingInstructions({ phoneNumber, isOpen, onClose }: CallForwardingInstructionsProps) {
  const [copied, setCopied] = useState(false)
  const { business } = useBusiness()
  
  // Use business's dedicated ReplyFlow number, fallback to prop if provided
  const forwardingNumber = business?.twilio_phone_number || phoneNumber

  const handleCopyScript = async () => {
    const script = `Hi, I want unanswered calls from my business number forwarded to this number: ${forwardingNumber}. Can you help me set up conditional call forwarding?`
    await navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyNumber = async () => {
    await navigator.clipboard.writeText(forwardingNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 sm:p-8 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">
            How to connect ReplyFlow to your business phone
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-8">
          {/* Explanation */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
            <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
              ReplyFlow only receives calls you miss or decline. Your phone will continue to ring normally first.
            </p>
          </div>

          {/* Steps */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Setup Steps:</h3>
            <ol className="space-y-4">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">1</span>
                <p className="text-base text-gray-700 dark:text-gray-300 pt-1">Copy your ReplyFlow number</p>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">2</span>
                <p className="text-base text-gray-700 dark:text-gray-300 pt-1">Open your phone or carrier call forwarding settings</p>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">3</span>
                <p className="text-base text-gray-700 dark:text-gray-300 pt-1">Choose missed-call, unanswered-call, or conditional forwarding</p>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">4</span>
                <p className="text-base text-gray-700 dark:text-gray-300 pt-1">Forward those calls to your ReplyFlow number</p>
              </li>
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">5</span>
                <p className="text-base text-gray-700 dark:text-gray-300 pt-1">Test by calling your business number and letting it go unanswered</p>
              </li>
            </ol>
          </div>

          {/* ReplyFlow Number Display */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6">
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-5 text-center">Your ReplyFlow forwarding code:</p>
            
            {/* Forwarding Code Box */}
            <div
              onClick={handleCopyNumber}
              className="bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-8 cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-all active:scale-95 select-none"
            >
              {/* Activation Code */}
              <div className="text-center mb-5">
                <span className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-gray-100 font-mono tracking-wider">
                  *71
                </span>
              </div>
              
              {/* Arrow */}
              <div className="text-center mb-5">
                <svg className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              
              {/* Phone Number */}
              <div className="text-center">
                {forwardingNumber ? (
                  <span className="text-3xl sm:text-4xl font-bold text-blue-600 dark:text-blue-400 font-mono tracking-wide">
                    {formatPhoneNumber(forwardingNumber)}
                  </span>
                ) : (
                  <span className="text-lg sm:text-xl font-medium text-gray-500 dark:text-gray-400 text-center px-4">
                    Your ReplyFlow number is still being set up
                  </span>
                )}
              </div>
              
              {/* Tap to Copy Hint */}
              <div className="text-center mt-5">
                <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  {copied ? '✓ Copied!' : 'Tap to copy'}
                </span>
              </div>
            </div>

            {/* What You'll Hear */}
            <div className="mt-5 p-5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-base text-gray-700 dark:text-gray-300 text-center leading-relaxed">
                <span className="font-semibold">What you'll hear:</span><br />
                {forwardingNumber ? (
                  <>
                    Your carrier may say:<br />
                    <span className="font-mono text-blue-700 dark:text-blue-300">"Calls will be forwarded to {forwardingNumber.replace('+1', '1-')}."</span>
                  </>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">Set up forwarding once your ReplyFlow number is assigned</span>
                )}
              </p>
            </div>

            {/* Carrier Confidence Text */}
            <div className="mt-5 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This only activates missed-call forwarding. Your phone still rings normally.
              </p>
            </div>
          </div>

          {/* Carrier-specific Instructions */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">Carrier-specific instructions:</h3>
            <div className="space-y-4">
              {/* Verizon */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Verizon</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                      Dial <span className="font-mono bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded text-sm">*71</span> followed by your ReplyFlow number, then press Call/Send.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      To deactivate: Dial <span className="font-mono bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded text-xs">*73</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* AT&T */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">AT&T</h4>
                    
                    {/* AT&T Wireless */}
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">AT&T Wireless:</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                        On many AT&T wireless phones, conditional call forwarding is managed from the phone's call settings or dialer.
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                        Try your phone's call forwarding settings first. If your device supports star codes, use the unanswered/no-reply forwarding option and forward missed calls to your ReplyFlow number.
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                        If this does not work, contact AT&T and ask them to enable conditional call forwarding/no-answer forwarding to your ReplyFlow number.
                      </p>
                    </div>

                    {/* AT&T Business/Home Phone */}
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">AT&T Business/Home Phone:</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                        Dial <span className="font-mono bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded text-sm">*92</span>, then enter your ReplyFlow number ({formatPhoneNumber(forwardingNumber)}), then press <span className="font-mono bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded text-sm">#</span>.
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        To turn it off later, dial <span className="font-mono bg-gray-100 dark:bg-gray-600 px-2 py-0.5 rounded text-sm">*93#</span>.
                      </p>
                    </div>

                    {/* Fallback note */}
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                      AT&T plans and devices can vary. If this code does not work, contact AT&T and ask for no-answer or conditional call forwarding.
                    </p>
                  </div>
                </div>
              </div>

              {/* T-Mobile */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-pink-600 dark:text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">T-Mobile</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                      Use the T-Mobile app or call 611 to set up "No Answer/Busy Transfer" to your ReplyFlow number.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      To deactivate: Use the T-Mobile app or call 611. T-Mobile does not use standard dial codes for conditional forwarding.
                    </p>
                  </div>
                </div>
              </div>

              {/* iPhone */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-600 flex items-center justify-center">
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">iPhone (iOS)</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                      iOS doesn't have conditional forwarding in settings. Use your carrier's dial codes (see above) or contact your carrier.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Note: iOS "Call Forwarding" setting forwards ALL calls, not just missed ones
                    </p>
                  </div>
                </div>
              </div>

              {/* Android */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Android</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                      Use your carrier's dial codes (see above) for reliable conditional forwarding.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Phone settings vary by manufacturer and carrier - dial codes work universally
                    </p>
                  </div>
                </div>
              </div>

              {/* Landline */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Landline/Office Phone</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      Contact your phone provider to set up conditional call forwarding
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Support Script */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Support script for your phone provider:</h4>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
                "Hi, I want unanswered calls from my business number forwarded to this number: {formatPhoneNumber(forwardingNumber)}. Can you help me set up conditional call forwarding?"
              </p>
            </div>
            <button
              onClick={handleCopyScript}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {copied ? 'Copied!' : 'Copy Support Script'}
            </button>
          </div>

          {/* Troubleshooting */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Troubleshooting tips:</h4>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex gap-2">
                <span className="text-amber-600 dark:text-amber-400">•</span>
                <span>Wait 2-5 minutes for forwarding to activate after setup</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600 dark:text-amber-400">•</span>
                <span>Restart your phone if forwarding doesn't work immediately</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600 dark:text-amber-400">•</span>
                <span>Turn off Wi-Fi calling if forwarding doesn't activate</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600 dark:text-amber-400">•</span>
                <span>Contact your carrier support if dial codes don't work on your device</span>
              </li>
            </ul>
          </div>

          {/* Note */}
          <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            <p>Note: Set up "forward when busy" or "forward when unanswered" to only forward missed calls. This way you can still answer calls normally.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 sm:p-8 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
