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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-foreground">Create Job</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Prompt */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-sm text-slate-500 dark:text-slate-400">How would you like to create this job?</p>
          </div>

          {/* Options */}
          <div className="p-5 pt-3 space-y-3">
            {/* Manual Job */}
            <button
              onClick={() => { onClose(); onSelectManual() }}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all text-left group active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 flex items-center justify-center flex-shrink-0 transition-colors">
                <FileText className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-foreground">Create Manually</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Enter customer and job details from scratch.
                </p>
              </div>
            </button>

            {/* Existing Lead */}
            <button
              onClick={() => { onClose(); onSelectLead() }}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all text-left group active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 flex items-center justify-center flex-shrink-0 transition-colors">
                <Users className="w-4.5 h-4.5 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-foreground">Use Existing Lead</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
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
