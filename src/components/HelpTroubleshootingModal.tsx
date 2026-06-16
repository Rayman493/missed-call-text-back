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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-border px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Help & Troubleshooting</h2>
              <p className="text-xs text-muted-foreground">Forwarding setup support</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Disable Forwarding Section */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Disable Call Forwarding
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Dial these codes on your phone to temporarily disable ReplyFlow:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="bg-muted border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">Verizon</span>
                  <button
                    onClick={() => handleCopyCode('*73', 'verizon')}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                  >
                    {copiedCode === 'verizon' ? (
                      <>
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <code className="text-base font-mono font-bold text-foreground">*73</code>
              </div>

              <div className="bg-muted border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">AT&T</span>
                  <button
                    onClick={() => handleCopyCode('*93', 'att')}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                  >
                    {copiedCode === 'att' ? (
                      <>
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <code className="text-base font-mono font-bold text-foreground">*93</code>
              </div>

              <div className="bg-muted border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">T-Mobile</span>
                  <button
                    onClick={() => handleCopyCode('##61#', 'tmobile')}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                  >
                    {copiedCode === 'tmobile' ? (
                      <>
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <code className="text-base font-mono font-bold text-foreground">##61#</code>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Other carriers: Search "disable call forwarding" or contact your carrier.
            </p>
          </div>

          {/* Re-enable Forwarding Section */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
              Re-enable Call Forwarding
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Go to <span className="font-semibold">Settings → Review Forwarding Setup</span> and re-enter your carrier's code.
            </p>
          </div>

          {/* Troubleshooting Steps */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Common Issues
            </h3>
            <div className="space-y-2">
              <div className="bg-muted border border-border rounded-lg p-3">
                <p className="text-xs font-medium text-foreground mb-1">Forwarding not working</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>• Verify code was entered correctly</li>
                  <li>• Restart your phone if needed</li>
                  <li>• Ensure carrier supports conditional forwarding</li>
                </ul>
              </div>

              <div className="bg-muted border border-border rounded-lg p-3">
                <p className="text-xs font-medium text-foreground mb-1">Calls not reaching ReplyFlow</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  <li>• Run verification test from dashboard</li>
                  <li>• Check carrier settings</li>
                  <li>• Re-enter forwarding code</li>
                </ul>
              </div>

              <div className="bg-muted border border-border rounded-lg p-3">
                <p className="text-xs font-medium text-foreground mb-1">Still having trouble?</p>
                <p className="text-xs text-muted-foreground">
                  Contact your carrier to verify configuration and resolve activation issues.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-2.5 px-6 rounded-xl transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
