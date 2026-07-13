'use client'

import React from 'react'
import { X, Copy, CheckCircle2, Phone, AlertCircle, HelpCircle } from 'lucide-react'

interface HelpTroubleshootingModalProps {
  isOpen: boolean
  onClose: () => void
  twilioPhoneNumber?: string
}

export default function HelpTroubleshootingModal({ isOpen, onClose, twilioPhoneNumber }: HelpTroubleshootingModalProps) {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null)

  const handleCopyCode = (code: string, label: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(label)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[calc(100dvh-80px)] flex flex-col" tabIndex={-1}>
        {/* Header */}
        <div className="flex-shrink-0 bg-slate-900 border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-900/30 rounded-full flex items-center justify-center">
              <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            </div>
            <div>
              <h2 id="help-modal-title" className="text-base sm:text-lg font-semibold text-foreground">Help & Troubleshooting</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">Forwarding setup support</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Close help modal"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content - scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 space-y-3 sm:space-y-4">
          {/* Disable Forwarding Section */}
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              Disable Call Forwarding
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
              Dial these codes on your phone to temporarily disable ReplyFlow:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              <div className="bg-muted border border-border rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <span className="text-xs sm:text-sm font-medium text-foreground">Verizon</span>
                  <button
                    onClick={() => handleCopyCode('*73', 'verizon')}
                    className="text-[10px] sm:text-xs text-blue-400 hover:underline flex items-center gap-1.5 transition-colors"
                  >
                    {copiedCode === 'verizon' ? (
                      <>
                        <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <code className="text-base sm:text-lg font-mono font-bold text-foreground">*73</code>
              </div>

              <div className="bg-muted border border-border rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <span className="text-xs sm:text-sm font-medium text-foreground">AT&T</span>
                  <button
                    onClick={() => handleCopyCode('*93', 'att')}
                    className="text-[10px] sm:text-xs text-blue-400 hover:underline flex items-center gap-1.5 transition-colors"
                  >
                    {copiedCode === 'att' ? (
                      <>
                        <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <code className="text-base sm:text-lg font-mono font-bold text-foreground">*93</code>
              </div>

              <div className="bg-muted border border-border rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <span className="text-xs sm:text-sm font-medium text-foreground">T-Mobile</span>
                  <button
                    onClick={() => handleCopyCode('##61#', 'tmobile')}
                    className="text-[10px] sm:text-xs text-blue-400 hover:underline flex items-center gap-1.5 transition-colors"
                  >
                    {copiedCode === 'tmobile' ? (
                      <>
                        <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <code className="text-base sm:text-lg font-mono font-bold text-foreground">##61#</code>
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2">
              Other carriers: Search "disable call forwarding" or contact your carrier.
            </p>
          </div>

          {/* Re-enable Forwarding Section */}
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" />
              Re-enable Call Forwarding
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Go to <span className="font-semibold">Settings → Review Forwarding Setup</span> and re-enter your carrier's code.
            </p>
          </div>

          {/* Troubleshooting Steps */}
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              Common Issues
            </h3>
            <div className="space-y-2 sm:space-y-3">
              <div className="bg-muted border border-border rounded-lg p-3 sm:p-4">
                <p className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2">Forwarding not working</p>
                <ul className="text-xs sm:text-sm text-muted-foreground space-y-0.5 sm:space-y-1">
                  <li>• Verify code was entered correctly</li>
                  <li>• Restart your phone if needed</li>
                  <li>• Ensure carrier supports conditional forwarding</li>
                </ul>
              </div>

              <div className="bg-muted border border-border rounded-lg p-3 sm:p-4">
                <p className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2">Calls not reaching ReplyFlow</p>
                <ul className="text-xs sm:text-sm text-muted-foreground space-y-0.5 sm:space-y-1">
                  <li>• Run verification test from dashboard</li>
                  <li>• Check carrier settings</li>
                  <li>• Re-enter forwarding code</li>
                </ul>
              </div>

              <div className="bg-muted border border-border rounded-lg p-3 sm:p-4">
                <p className="text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2">Still having trouble?</p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Contact your carrier to verify configuration and resolve activation issues.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-border px-4 sm:px-6 py-3 sm:py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
