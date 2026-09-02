'use client'

import { Users } from 'lucide-react'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import Modal from '@/components/ui/Modal'

interface NewJobModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectLead: () => void
  onCreateCustomer: () => void
  title?: string
  prompt?: string
}

export default function NewJobModal({
  isOpen,
  onClose,
  onSelectLead,
  onCreateCustomer,
  title = 'Create Job',
  prompt = 'Choose a customer for this job',
}: NewJobModalProps) {
  // Handle Android back button and browser back to close modal
  useModalBackButton({ isOpen, onClose })

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
    >
      {/* Prompt */}
      <p className="text-sm text-muted-foreground/70 mb-4">{prompt}</p>

      {/* Options */}
      <div className="space-y-2">
        {/* Existing Lead - Primary Action */}
        <button
          onClick={() => { onClose(); onSelectLead() }}
          className="w-full flex items-start gap-3 p-2.5 rounded-lg border border-border/30 bg-muted/30 hover:border-border/50 hover:bg-muted/50 transition-all text-left group active:scale-[0.98]"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center flex-shrink-0 transition-colors">
            <Users className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Select Existing Customer</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
              Choose a customer already in ReplyFlow.
            </p>
          </div>
        </button>

        {/* Create New Customer */}
        <button
          onClick={() => { onClose(); onCreateCustomer() }}
          className="w-full flex items-start gap-3 p-2.5 rounded-lg border border-border/30 bg-muted/30 hover:border-border/50 hover:bg-muted/50 transition-all text-left group active:scale-[0.98]"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 group-hover:bg-primary/15 flex items-center justify-center flex-shrink-0 transition-colors">
            <Users className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Create a New Customer</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
              Add a customer now, then continue creating the job.
            </p>
          </div>
        </button>
      </div>
    </Modal>
  )
}
