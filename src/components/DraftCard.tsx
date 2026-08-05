'use client'

import React, { useState, useEffect } from 'react'
import { FileText, Check, Edit2, X, Sparkles } from 'lucide-react'
import { draftService } from '@/lib/autopilot-drafts/autopilot-drafts-service'
import type { MessageDraft } from '@/lib/autopilot-drafts/autopilot-drafts-types'

interface DraftCardProps {
  businessId: string
  customerId: string
}

export default function DraftCard({ businessId, customerId }: DraftCardProps) {
  const [draft, setDraft] = useState<MessageDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')

  useEffect(() => {
    setLoading(true)
    draftService.getDraft({ businessId, customerId })
      .then(setDraft)
      .catch(err => {
        console.error('[DraftCard] Failed to fetch draft:', err)
      })
      .finally(() => setLoading(false))
  }, [businessId, customerId])

  const handleApprove = async () => {
    if (!draft) return
    try {
      await draftService.approveDraft(draft.id)
      setDraft(null)
    } catch (err) {
      console.error('[DraftCard] Failed to approve draft:', err)
    }
  }

  const handleEdit = () => {
    if (!draft) return
    setEditedContent(draft.content)
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!draft) return
    try {
      await draftService.editDraft(draft.id, editedContent)
      setIsEditing(false)
      setDraft({ ...draft, content: editedContent, status: 'edited' })
    } catch (err) {
      console.error('[DraftCard] Failed to edit draft:', err)
    }
  }

  const handleDiscard = async () => {
    if (!draft) return
    try {
      await draftService.discardDraft(draft.id)
      setDraft(null)
    } catch (err) {
      console.error('[DraftCard] Failed to discard draft:', err)
    }
  }

  if (loading || !draft) {
    return null
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200/70 dark:border-amber-800/50 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-100 dark:bg-amber-900/30">
          <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-900 dark:text-foreground">
              Draft Ready
            </span>
            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Sparkles className="w-3 h-3" />
              <span>{draft.confidence}% confident</span>
            </div>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
            {draft.reason}
          </div>

          {isEditing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full min-h-[80px] p-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          ) : (
            <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-white/50 dark:bg-slate-900/30 rounded-lg p-3">
              {draft.content}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            {isEditing ? (
              <>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleApprove}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Approve
                </button>
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={handleDiscard}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                  <X className="w-3 h-3" />
                  Discard
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
