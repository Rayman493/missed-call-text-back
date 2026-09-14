'use client'

import { FileText, FileSpreadsheet } from 'lucide-react'
import Modal from '@/components/ui/Modal'

interface BillingChooserModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectType: (type: 'quote' | 'invoice') => void
}

export default function BillingChooserModal({ isOpen, onClose, onSelectType }: BillingChooserModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quote / Invoice"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose a document type to create.
        </p>

        <button
          onClick={() => onSelectType('quote')}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 hover:shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-foreground">Create Quote</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Estimate with line items and valid-until date
            </p>
          </div>
        </button>

        <button
          onClick={() => onSelectType('invoice')}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 hover:shadow-sm hover:border-emerald-300 dark:hover:border-emerald-700 transition-all text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-foreground">Create Invoice</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Billable document with due date
            </p>
          </div>
        </button>
      </div>
    </Modal>
  )
}
