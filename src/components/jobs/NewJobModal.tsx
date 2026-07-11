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
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-4" data-scroll-lock-allow>
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-[0_1px_0_rgba(255,255,255,0.06),0_28px_90px_rgba(2,6,23,0.65)] backdrop-blur-xl w-full max-w-sm max-h-[80dvh] flex flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.025] flex-shrink-0">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
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
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.025] hover:border-blue-400/50 hover:bg-blue-500/10 transition-all text-left group active:scale-[0.99]"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 flex items-center justify-center flex-shrink-0 transition-colors ring-1 ring-blue-400/15">
                <Users className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Select Existing Customer</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Choose from your existing customers.
                </p>
              </div>
            </button>

            {/* Add New Customer */}
            <button
              onClick={() => { onClose(); onAddCustomer() }}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.025] hover:border-blue-400/50 hover:bg-blue-500/10 transition-all text-left group active:scale-[0.99]"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 flex items-center justify-center flex-shrink-0 transition-colors ring-1 ring-blue-400/15">
                <FileText className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Add New Customer</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
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
