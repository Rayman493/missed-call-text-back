'use client'

import { X, FileText, Users } from 'lucide-react'

interface NewJobModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectManual: () => void
  onSelectLead: () => void
}

export default function NewJobModal({
  isOpen,
  onClose,
  onSelectManual,
  onSelectLead,
}: NewJobModalProps) {
  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[env(safe-area-inset-bottom)]">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-[0_1px_0_rgba(255,255,255,0.06),0_28px_90px_rgba(2,6,23,0.65)] backdrop-blur-xl w-full max-w-sm max-h-[90dvh] flex flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/40 to-transparent" />
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-4 border-b border-white/10 bg-white/[0.025] flex-shrink-0">
            <h2 className="text-base font-semibold text-white">Create Job</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Prompt */}
          <div className="px-4 sm:px-5 pt-3 sm:pt-4 pb-1">
            <p className="text-sm text-slate-400">How would you like to create this job?</p>
          </div>

          {/* Options */}
          <div className="p-4 sm:p-5 pt-3 space-y-2.5 sm:space-y-3">
            {/* Manual Job */}
            <button
              onClick={() => { onClose(); onSelectManual() }}
              className="w-full flex items-start gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl border border-white/10 bg-white/[0.025] hover:border-blue-400/50 hover:bg-blue-500/10 transition-all text-left group active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 flex items-center justify-center flex-shrink-0 transition-colors ring-1 ring-blue-400/15">
                <FileText className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Create Manually</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Enter customer and job details from scratch.
                </p>
              </div>
            </button>

            {/* Existing Lead */}
            <button
              onClick={() => { onClose(); onSelectLead() }}
              className="w-full flex items-start gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl border border-white/10 bg-white/[0.025] hover:border-blue-400/50 hover:bg-blue-500/10 transition-all text-left group active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 flex items-center justify-center flex-shrink-0 transition-colors ring-1 ring-blue-400/15">
                <Users className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Use Existing Lead</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Prefill a job from a ReplyFlow lead or caller.
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
