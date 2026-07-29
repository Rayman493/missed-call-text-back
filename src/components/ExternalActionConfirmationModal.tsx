'use client'

import { PendingExternalAction } from '@/lib/pending-actions'

interface ExternalActionConfirmationModalProps {
  pendingAction: PendingExternalAction
  onConfirm: () => Promise<void>
  onCancel: () => void
  onDismiss?: () => void
  isSubmitting: boolean
  error?: string
}

export default function ExternalActionConfirmationModal({
  pendingAction,
  onConfirm,
  onCancel,
  onDismiss,
  isSubmitting,
  error
}: ExternalActionConfirmationModalProps) {
  const getModalContent = () => {
    switch (pendingAction.actionType) {
      case 'business_phone_text':
        return {
          title: 'Did you send the message?',
          body: 'Record this text in ReplyFlow\'s customer timeline?',
          primaryAction: 'Record as sent',
          secondaryAction: 'Not sent'
        }
      case 'business_phone_payment_request':
        return {
          title: 'Did you send the payment request?',
          body: 'Record that the payment link was sent from your business phone?',
          primaryAction: 'Record as sent',
          secondaryAction: 'Not sent'
        }
      case 'business_phone_call':
        return {
          title: pendingAction.customerName 
            ? `Did you call ${pendingAction.customerName}?`
            : 'Did you call the customer?',
          body: 'Record this call in ReplyFlow\'s customer timeline?',
          primaryAction: 'Record call',
          secondaryAction: 'Not completed'
        }
    }
  }

  const content = getModalContent()

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onDismiss}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">
          {content.title}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          {content.body}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">
              {error}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {content.secondaryAction}
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Recording...' : content.primaryAction}
          </button>
        </div>
      </div>
    </div>
  )
}
