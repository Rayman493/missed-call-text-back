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
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Help & Troubleshooting</h2>
              <p className="text-sm text-muted-foreground">Forwarding setup support</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Disable Forwarding Section */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Disable Call Forwarding
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              If you need to temporarily disable ReplyFlow, dial these codes on your phone:
            </p>
            <div className="space-y-3">
              <div className="bg-muted border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground">Verizon</span>
                  <button
                    onClick={() => handleCopyCode('*73', 'verizon')}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {copiedCode === 'verizon' ? (
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
                </div>
                <code className="text-lg font-mono font-bold text-foreground">*73</code>
                <p className="text-xs text-muted-foreground mt-1">Dial and press Call</p>
              </div>

              <div className="bg-muted border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground">AT&T</span>
                  <button
                    onClick={() => handleCopyCode('*93', 'att')}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {copiedCode === 'att' ? (
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
                </div>
                <code className="text-lg font-mono font-bold text-foreground">*93</code>
                <p className="text-xs text-muted-foreground mt-1">Dial and press Call</p>
              </div>

              <div className="bg-muted border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground">T-Mobile</span>
                  <button
                    onClick={() => handleCopyCode('##61#', 'tmobile')}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {copiedCode === 'tmobile' ? (
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
                </div>
                <code className="text-lg font-mono font-bold text-foreground">##61#</code>
                <p className="text-xs text-muted-foreground mt-1">Dial and press Call</p>
              </div>

              <div className="bg-muted border border-border rounded-xl p-4">
                <span className="font-medium text-foreground block mb-2">Other Carriers</span>
                <p className="text-sm text-muted-foreground">
                  Search for your carrier's "disable call forwarding" instructions or contact your carrier for help.
                </p>
              </div>
            </div>
          </div>

          {/* Re-enable Forwarding Section */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              Re-enable Call Forwarding
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              To restore ReplyFlow, revisit the forwarding setup page and re-enter your carrier's forwarding code:
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                Go to <span className="font-semibold">Settings → Review Forwarding Setup</span>
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Select your carrier and dial the forwarding code shown to re-enable.
              </p>
            </div>
          </div>

          {/* Troubleshooting Steps */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              Common Issues
            </h3>
            <div className="space-y-3">
              <div className="bg-muted border border-border rounded-xl p-4">
                <p className="text-sm font-medium text-foreground mb-1">Forwarding not working</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Verify the forwarding code was entered correctly</li>
                  <li>• Restart your phone if changes don't take effect</li>
                  <li>• Ensure your carrier supports conditional forwarding</li>
                </ul>
              </div>

              <div className="bg-muted border border-border rounded-xl p-4">
                <p className="text-sm font-medium text-foreground mb-1">Calls not reaching ReplyFlow</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Run another verification test from the dashboard</li>
                  <li>• Check if carrier settings changed recently</li>
                  <li>• Re-enter the forwarding code if needed</li>
                </ul>
              </div>

              <div className="bg-muted border border-border rounded-xl p-4">
                <p className="text-sm font-medium text-foreground mb-1">Still having trouble?</p>
                <p className="text-sm text-muted-foreground">
                  Contact your carrier for assistance. They can verify your forwarding configuration and help resolve activation issues.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
