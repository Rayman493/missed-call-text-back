'use client'

import { useRouter } from 'next/navigation'
import { Smartphone, CreditCard, CheckCircle, X } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface TapToPaySetupModalProps {
  isOpen: boolean
  onClose: () => void
  setupState: 'not_connected' | 'incomplete' | 'ready'
}

export default function TapToPaySetupModal({
  isOpen,
  onClose,
  setupState,
}: TapToPaySetupModalProps) {
  const router = useRouter()
  useBodyScrollLock(isOpen)

  const handleConnectStripe = () => {
    onClose()
    router.push('/dashboard/settings#payments')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/50 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Set up Tap to Pay</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
          {setupState === 'not_connected' && (
            <>
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h4 className="text-xl font-semibold text-foreground mb-2">Accept contactless payments</h4>
                <p className="text-sm text-muted-foreground">
                  Collect payments in person using your phone
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-500/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CreditCard className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Connect Stripe</p>
                    <p className="text-xs text-muted-foreground">
                      Securely process payments and receive payouts to your bank account
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-500/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Start collecting payments</p>
                    <p className="text-xs text-muted-foreground">
                      Accept contactless payments from customers immediately
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-semibold">Why Stripe?</span> Stripe securely processes your payments and sends payouts directly to your connected bank account. Setup takes just a few minutes.
                </p>
              </div>
            </>
          )}

          {setupState === 'incomplete' && (
            <>
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
                <h4 className="text-xl font-semibold text-foreground mb-2">Finish Stripe setup</h4>
                <p className="text-sm text-muted-foreground">
                  Complete your Stripe onboarding to accept payments
                </p>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-semibold">Action required:</span> Your Stripe account setup is incomplete. Complete the remaining steps in Settings to enable payments.
                </p>
              </div>
            </>
          )}

          {setupState === 'ready' && (
            <>
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h4 className="text-xl font-semibold text-foreground mb-2">Tap to Pay is ready</h4>
                <p className="text-sm text-muted-foreground">
                  Your Stripe account is configured and ready to accept payments
                </p>
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-xs text-green-700 dark:text-green-300">
                  <span className="font-semibold">All set!</span> You can now accept contactless payments from customers using your phone.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
          >
            {setupState === 'ready' ? 'Close' : 'Not now'}
          </button>
          {setupState !== 'ready' && (
            <button
              onClick={handleConnectStripe}
              className="flex-1 px-4 py-3 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              {setupState === 'not_connected' ? 'Connect Stripe' : 'Complete Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
