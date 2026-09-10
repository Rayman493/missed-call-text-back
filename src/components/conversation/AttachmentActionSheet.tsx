'use client'

import React, { useRef, useCallback, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { Camera, Image as ImageIcon, FileText } from 'lucide-react'

/**
 * AttachmentActionSheet — Premium paperclip action surface
 *
 * Three choices:
 * - Take Photo    → native camera capture (capture="environment")
 * - Choose Photo  → system photo picker / gallery (accept="image/*")
 * - Choose File   → existing document/file picker (full accept types)
 *
 * Lifecycle separation:
 * - onClose: action sheet dismissed (backdrop/escape) — NO native picker was launched
 * - onPickerLaunch: user selected a picker type — native picker about to open
 * - onPickerReturn: native picker returned (change or cancel) — files or null
 *
 * The parent owns the picker session state machine and scroll restoration.
 * This component only signals lifecycle transitions.
 */

interface AttachmentActionSheetProps {
  isOpen: boolean
  /** Action sheet dismissed without launching a picker (backdrop/escape) */
  onClose: () => void
  /** User selected a picker type — native picker is about to open */
  onPickerLaunch: () => void
  /** Native picker returned. files = null means cancelled. */
  onPickerReturn: (files: File[] | null) => void
  /** Full accept string for the "Choose File" path */
  fileAccept?: string
}

export default function AttachmentActionSheet({
  isOpen,
  onClose,
  onPickerLaunch,
  onPickerReturn,
  fileAccept = 'image/jpeg,image/png,image/gif,application/pdf,text/csv,video/mp4,.mp4'
}: AttachmentActionSheetProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const photoPickerRef = useRef<HTMLInputElement>(null)
  const filePickerRef = useRef<HTMLInputElement>(null)
  // Track which input was launched so we can map return signals
  const activeInputRef = useRef<HTMLInputElement | null>(null)
  // Ref for onPickerReturn to avoid re-attaching cancel listeners on every render
  const onPickerReturnRef = useRef(onPickerReturn)
  onPickerReturnRef.current = onPickerReturn

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target // the actual input element — use directly for reset
    const files = input.files
    activeInputRef.current = null

    if (files && files.length > 0) {
      onPickerReturnRef.current(Array.from(files))
    } else {
      // change fired with no files — treat as cancel
      onPickerReturnRef.current(null)
    }

    // Reset the input value AFTER reading files so the same file can be
    // selected again. Do NOT reset before reading.
    input.value = ''
  }

  const handleFileCancel = useCallback(() => {
    // cancel event fires when user dismisses the native picker without selecting
    // This is AUTHORITATIVE cancellation — overrides any visibilitychange fallback
    const input = activeInputRef.current
    activeInputRef.current = null
    if (input) {
      input.value = '' // ensure clean state for re-selection
    }
    onPickerReturnRef.current(null)
  }, [])

  // Attach cancel event listeners via useEffect — React doesn't type onCancel
  // for input elements, so we attach it as a native DOM event listener.
  // Uses stable handleFileCancel (no deps) so listeners are attached once.
  useEffect(() => {
    const inputs = [cameraInputRef.current, photoPickerRef.current, filePickerRef.current]
    const validInputs = inputs.filter((input): input is HTMLInputElement => input !== null)
    validInputs.forEach(input => {
      input.addEventListener('cancel', handleFileCancel)
    })
    return () => {
      validInputs.forEach(input => {
        input.removeEventListener('cancel', handleFileCancel)
      })
    }
  }, [handleFileCancel])

  const launchPicker = (inputRef: React.RefObject<HTMLInputElement>) => {
    activeInputRef.current = inputRef.current
    onPickerLaunch()
    // Defer the click to next tick so onPickerLaunch (which closes the sheet)
    // is processed before the native picker opens
    requestAnimationFrame(() => {
      inputRef.current?.click()
    })
  }

  const handleTakePhoto = useCallback(() => {
    launchPicker(cameraInputRef)
  }, [])

  const handleChoosePhoto = useCallback(() => {
    launchPicker(photoPickerRef)
  }, [])

  const handleChooseFile = useCallback(() => {
    launchPicker(filePickerRef)
  }, [])

  return (
    <>
      {/* Hidden inputs — each with a specific capture/accept strategy */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={photoPickerRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={filePickerRef}
        type="file"
        accept={fileAccept}
        multiple
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title=""
        footer={null}
        bottomSheetOnMobile
      >
        <div className="py-2">
          <p className="text-xs text-muted-foreground font-medium mb-3 px-1">
            Attach to message
          </p>
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleTakePhoto}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0">
                <Camera className="w-5 h-5" />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground">Take Photo</span>
                <span className="text-xs text-muted-foreground">Use camera to capture a new photo</span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleChoosePhoto}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 flex-shrink-0">
                <ImageIcon className="w-5 h-5" />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground">Choose Photo</span>
                <span className="text-xs text-muted-foreground">Select from photo library</span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleChooseFile}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex-shrink-0">
                <FileText className="w-5 h-5" />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground">Choose File</span>
                <span className="text-xs text-muted-foreground">PDF, CSV, image, or video</span>
              </span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
