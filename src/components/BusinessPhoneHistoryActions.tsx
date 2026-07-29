'use client'

import { useState } from 'react'
import { Smartphone, Edit2, X } from 'lucide-react'

interface BusinessPhoneHistoryActionsProps {
  messageId: string
  currentNote: string
  onUpdate?: () => void
  onDelete?: () => void
}

export default function BusinessPhoneHistoryActions({
  messageId,
  currentNote,
  onUpdate,
  onDelete
}: BusinessPhoneHistoryActionsProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedNote, setEditedNote] = useState(currentNote)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEditNote = async () => {
    try {
      setError(null)
      const response = await fetch('/api/business-phone/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          action: 'edit_note',
          editedNote: editedNote.trim()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update note')
      }

      setIsEditing(false)
      if (onUpdate) onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update note')
    }
  }

  const handleDelete = async () => {
    try {
      setError(null)
      setIsDeleting(true)
      const response = await fetch('/api/business-phone/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          action: 'remove'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to remove message')
      }

      setShowDeleteConfirm(false)
      if (onDelete) onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove message')
      setIsDeleting(false)
    }
  }

  if (showDeleteConfirm) {
    return (
      <div className="bg-muted/80 px-3 py-2 rounded-lg border border-border/50">
        <p className="text-xs text-foreground mb-2">
          Remove this Business Phone communication from the conversation history?
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowDeleteConfirm(false)
              setIsDeleting(false)
            }}
            disabled={isDeleting}
            className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className="bg-muted/80 px-3 py-2 rounded-lg border border-border/50">
        <textarea
          value={editedNote}
          onChange={(e) => setEditedNote(e.target.value)}
          className="w-full bg-transparent text-foreground text-xs resize-none focus:outline-none min-h-[60px]"
          placeholder="Edit note..."
          maxLength={500}
          autoFocus
        />
        <div className="flex justify-between items-center mt-2">
          {error && (
            <span className="text-xs text-red-500">{error}</span>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => {
                setIsEditing(false)
                setEditedNote(currentNote)
                setError(null)
              }}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleEditNote}
              disabled={!editedNote.trim() || editedNote.trim() === currentNote}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => setIsEditing(true)}
        className="px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        title="Edit note"
      >
        <Edit2 className="w-3 h-3" />
        Edit note
      </button>
      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="px-2 py-1 text-xs font-medium text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-1"
        title="Didn't send"
      >
        <X className="w-3 h-3" />
        Didn't send
      </button>
    </div>
  )
}
