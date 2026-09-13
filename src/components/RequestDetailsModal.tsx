'use client'

import React from 'react'
import Modal from '@/components/ui/Modal'
import { MessageSquare, FileText, MapPin, Clock, Phone, Calendar, CheckCircle2 } from 'lucide-react'
import type { NormalizedIntake } from '@/lib/ai-call-record-normalizer'

interface RequestDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  record: NormalizedIntake | null
}

/**
 * ReplyFlow-style Request Details modal for historical AI intake records.
 *
 * Shows ONLY the fields persisted for the exact historical intake passed in.
 * Does NOT read from current Customer Context, does NOT mutate the lead,
 * does NOT change the active conversation, and does NOT refetch anything.
 *
 * Identity: ai_call_record.id (via NormalizedIntake.id).
 * CallSid is supporting identity only.
 */
export default function RequestDetailsModal({ isOpen, onClose, record }: RequestDetailsModalProps) {
  if (!record) return null

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return iso
    }
  }

  const formatOutcome = (outcome: string) => {
    return outcome
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Details"
    >
      <div className="space-y-4">
        {/* Status / Outcome badge */}
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{formatOutcome(record.outcome)}</span>
        </div>

        {/* Intake date/time */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span>{formatDateTime(record.receivedAt)}</span>
        </div>

        {/* Divider */}
        <div className="border-t border-border/50" />

        {/* Request / Reason */}
        <DetailRow
          icon={<MessageSquare className="w-4 h-4" />}
          label="Request"
          value={record.serviceRequested}
        />

        {/* Details */}
        <DetailRow
          icon={<FileText className="w-4 h-4" />}
          label="Details"
          value={record.additionalDetails}
        />

        {/* Location / Address */}
        <DetailRow
          icon={<MapPin className="w-4 h-4" />}
          label="Location"
          value={record.serviceAddress}
        />

        {/* Desired Completion Time */}
        <DetailRow
          icon={<Clock className="w-4 h-4" />}
          label="Desired Completion"
          value={record.desiredCompletion}
        />

        {/* Preferred Callback Time */}
        <DetailRow
          icon={<Phone className="w-4 h-4" />}
          label="Preferred Callback Time"
          value={record.callbackTime}
        />
      </div>
    </Modal>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-2">
        {icon}
        {label}
      </label>
      <p className="text-sm text-foreground px-3 py-2 bg-muted/30 rounded-lg break-words whitespace-pre-wrap">
        {value && value.trim() ? value : 'Not provided'}
      </p>
    </div>
  )
}
