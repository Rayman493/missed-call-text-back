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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
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
      <div className="relative bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" tabIndex={-1}>
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-900/30 rounded-full flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 id="help-modal-title" className="text-lg font-semibold text-foreground">Help & Troubleshooting</h2>
              <p className="text-sm text-muted-foreground">Forwarding setup support</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Close help modal"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          {/* Disable Forwarding Section */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-400" />
              Disable Call Forwarding
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Dial these codes on your phone to temporarily disable ReplyFlow:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-muted border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Verizon</span>
                  <button
                    onClick={() => handleCopyCode('*73', 'verizon')}
                    className="text-xs text-blue-400 hover:underline flex items-center gap-1.5 transition-colors"
                  >
                    {copiedCode === 'verizon' ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <code className="text-lg font-mono font-bold text-foreground">*73</code>
              </div>

              <div className="bg-muted border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">AT&T</span>
                  <button
                    onClick={() => handleCopyCode('*93', 'att')}
                    className="text-xs text-blue-400 hover:underline flex items-center gap-1.5 transition-colors"
                  >
                    {copiedCode === 'att' ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <code className="text-lg font-mono font-bold text-foreground">*93</code>
              </div>

              <div className="bg-muted border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">T-Mobile</span>
                  <button
                    onClick={() => handleCopyCode('##61#', 'tmobile')}
                    className="text-xs text-blue-400 hover:underline flex items-center gap-1.5 transition-colors"
                  >
                    {copiedCode === 'tmobile' ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <code className="text-lg font-mono font-bold text-foreground">##61#</code>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Other carriers: Search "disable call forwarding" or contact your carrier.
            </p>
          </div>

          {/* Re-enable Forwarding Section */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              Re-enable Call Forwarding
            </h3>
            <p className="text-sm text-muted-foreground mb-2">
              Go to <span className="font-semibold">Settings → Review Forwarding Setup</span> and re-enter your carrier's code.
            </p>
          </div>

          {/* Troubleshooting Steps */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Common Issues
            </h3>
            <div className="space-y-3">
              <div className="bg-muted border border-border rounded-lg p-4">
                <p className="text-sm font-medium text-foreground mb-2">Forwarding not working</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Verify code was entered correctly</li>
                  <li>• Restart your phone if needed</li>
                  <li>• Ensure carrier supports conditional forwarding</li>
                </ul>
              </div>

              <div className="bg-muted border border-border rounded-lg p-4">
                <p className="text-sm font-medium text-foreground mb-2">Calls not reaching ReplyFlow</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Run verification test from dashboard</li>
                  <li>• Check carrier settings</li>
                  <li>• Re-enter forwarding code</li>
                </ul>
              </div>

              <div className="bg-muted border border-border rounded-lg p-4">
                <p className="text-sm font-medium text-foreground mb-2">Still having trouble?</p>
                <p className="text-sm text-muted-foreground">
                  Contact your carrier to verify configuration and resolve activation issues.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
