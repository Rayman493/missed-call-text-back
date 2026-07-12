'use client'

import { X, FileText, Users } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface NewJobModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectLead: () => void
  onAddCustomer: () => void
  title?: string
  prompt?: string
}

export default function NewJobModal({
  isOpen,
  onClose,
  onSelectLead,
  onAddCustomer,
  title = 'Create Job',
  prompt = 'Select a customer to create a job for',
}: NewJobModalProps) {
  useBodyScrollLock(isOpen)

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-4" data-scroll-lock-allow>
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl shadow-black/10 dark:shadow-black/30 w-full max-w-sm max-h-[80dvh] flex flex-col animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-scroll-lock-allow style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Prompt */}
            <div className="px-4 pt-2.5 pb-0.5">
              <p className="text-sm text-slate-400">{prompt}</p>
            </div>

            {/* Options */}
            <div className="px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2">
            {/* Existing Lead */}
            <button
              onClick={() => { onClose(); onSelectLead() }}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-muted/50 hover:border-border hover:bg-muted transition-all text-left group active:scale-[0.98]"
            >
              <div className="w-8 h-8 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center flex-shrink-0 transition-colors">
                <Users className="w-4.5 h-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Select Existing Customer</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Choose from your existing customers.
                </p>
              </div>
            </button>

            {/* Add New Customer */}
            <button
              onClick={() => { onClose(); onAddCustomer() }}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-muted/50 hover:border-border hover:bg-muted transition-all text-left group active:scale-[0.98]"
            >
              <div className="w-8 h-8 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center flex-shrink-0 transition-colors">
                <FileText className="w-4.5 h-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Add New Customer</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Add a new customer in Customers, then create the job.
                </p>
              </div>
            </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
