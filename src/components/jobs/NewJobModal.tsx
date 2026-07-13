'use client'

import { X, Users, ArrowRight } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import Link from 'next/link'

interface NewJobModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectLead: () => void
  title?: string
  prompt?: string
}

export default function NewJobModal({
  isOpen,
  onClose,
  onSelectLead,
  title = 'Create Job',
  prompt = 'Choose a customer for this job',
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
            <div className="px-4 pt-2 pb-4 space-y-3">
            {/* Existing Lead - Primary Action */}
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
                  Choose a customer already in ReplyFlow.
                </p>
              </div>
            </button>

            {/* Create New Customer - Secondary Action */}
            <Link
              href="/dashboard/leads"
              onClick={onClose}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border/30 bg-muted/30 hover:border-border hover:bg-muted transition-all group active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 flex items-center justify-center flex-shrink-0 transition-colors">
                  <Users className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Create a New Customer</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">
                    Go to Customers first, then return to schedule the job.
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 flex-shrink-0 transition-colors" />
            </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
