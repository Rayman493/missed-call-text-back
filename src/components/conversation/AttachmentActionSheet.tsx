'use client'

import React, { useRef, useCallback, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { Camera, Image as ImageIcon, FileText, X } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Camera as CapacitorCamera } from '@capacitor/camera'
import { FILE_ACCEPT, attachmentLimitLines } from '@/lib/mms-constants'

/**
 * AttachmentActionSheet — Premium paperclip action surface
 *
 * Three choices:
 * - Take Photo    → Capacitor Camera plugin takePhoto() (direct camera launch on native)
 *                   Falls back to capture="environment" HTML input on web/desktop
 * - Choose Photo  → system photo picker / gallery (accept="image/*", no capture)
 * - Choose File   → existing document/file picker (full accept types)
 *
 * Lifecycle separation:
 * - onClose: action sheet dismissed (backdrop/escape) — NO native picker was launched
 * - onPickerLaunch: user selected a picker type — native picker about to open
 * - onPickerReturn: native picker returned (change or cancel) — files or null
 *
 * The parent owns the picker session state machine and scroll restoration.
 * This component only signals lifecycle transitions.
 *
 * ROOT CAUSE of Android Take Photo issue:
 *   The HTML attribute combination accept="image/*" capture="environment" is
 *   physically unreliable in this Capacitor/WebView environment — on Android,
 *   the WebView often routes capture inputs to the same system photo picker
 *   instead of launching the camera directly. The Capacitor Camera plugin
 *   invokes the native Android camera intent directly, bypassing the
 *   WebView file-input path entirely.
 *
 * MEMORY EFFICIENCY:
 *   Uses Camera.takePhoto() (v8.1.0+ API) which returns a MediaResult with
 *   webPath/uri — NOT a DataUrl/base64. The image bytes stay native until
 *   fetched as a Blob for the existing attachment pipeline. This avoids
 *   loading a full-resolution base64 string into JS memory.
 */

interface AttachmentActionSheetProps {
  isOpen: boolean
  /** Action sheet dismissed without launching a picker (backdrop/escape) */
  onClose: () => void
  /** User selected a picker type — native picker is about to open */
  onPickerLaunch: () => void
  /** Native picker returned. files = null means cancelled. */
  onPickerReturn: (files: File[] | null) => void
  /** Picker/capture failed with a real error (NOT cancellation) — show a message */
  onPickerError?: (message: string) => void
  /** Full accept string for the "Choose File" path */
  fileAccept?: string
}

/**
 * Convert a Capacitor Camera MediaResult (takePhoto, v8.1+) to a File via
 * fetch+Blob — image bytes stay native until fetched, avoiding a full-
 * resolution base64 string in JS memory.
 *
 * MediaResult exposes `uri` (native file URI) and `webPath` (WebView
 * URL) — there is no `path` field on MediaResult (that was the Photo
 * shape from the older deprecated photo API). On native we always run the
 * file URI through Capacitor.convertFileSrc() so a raw file:/// or
 * content:// URI becomes a fetchable WebView URL.
 */
export async function mediaResultToFile(result: { uri?: string; webPath?: string; metadata?: { format?: string } }): Promise<File | null> {
  let url: string | undefined
  if (Capacitor.isNativePlatform() && result.uri) {
    url = Capacitor.convertFileSrc(result.uri)
  } else {
    url = result.webPath || result.uri
  }
  if (!url) return null

  // Fetch the WebView-accessible URL as a Blob — bytes stay native until now
  const response = await fetch(url)
  if (!response.ok) return null
  const blob = await response.blob()
  if (blob.size === 0) return null

  // MIME: trust the fetched blob type first (reliable), then metadata format,
  // then jpeg default.
  const format = result.metadata?.format?.toLowerCase()
  const mime = blob.type || (format === 'png' ? 'image/png' : format === 'gif' ? 'image/gif' : 'image/jpeg')
  const ext = mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : 'jpg'
  const filename = `photo_${Date.now()}.${ext}`

  return new File([blob], filename, { type: mime })
}

/** Camera plugin rejects cancellations with "User cancelled photos app". */
export function isCameraCancel(err: unknown): boolean {
  const msg = (err as any)?.message ?? String(err ?? '')
  return /cancel/i.test(msg)
}

export default function AttachmentActionSheet({
  isOpen,
  onClose,
  onPickerLaunch,
  onPickerReturn,
  onPickerError,
  fileAccept = FILE_ACCEPT
}: AttachmentActionSheetProps) {
  // cameraInputRef is only used as a web/desktop fallback for Take Photo
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const photoPickerRef = useRef<HTMLInputElement>(null)
  const filePickerRef = useRef<HTMLInputElement>(null)
  // Track which input was launched so we can map return signals
  const activeInputRef = useRef<HTMLInputElement | null>(null)
  // Refs for callbacks to avoid re-attaching listeners / stale closures
  const onPickerReturnRef = useRef(onPickerReturn)
  onPickerReturnRef.current = onPickerReturn
  const onPickerErrorRef = useRef(onPickerError)
  onPickerErrorRef.current = onPickerError

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

  const handleTakePhoto = useCallback(async () => {
    // On Capacitor native platforms, use the Camera plugin takePhoto() API
    // (v8.1.0+) for a direct camera launch. On web/desktop, fall back to
    // the HTML capture input.
    if (Capacitor.isNativePlatform()) {
      onPickerLaunch()
      try {
        const result = await CapacitorCamera.takePhoto({
          quality: 90,
          // Cap target dimensions so a modern-phone capture stays under the
          // 5 MB MMS image limit — aspect ratio is preserved by the plugin.
          targetWidth: 2048,
          targetHeight: 2048,
          saveToGallery: false,
        })
        // Convert the MediaResult (webPath/uri) to a File via fetch+Blob
        // This avoids loading a full-resolution base64 DataUrl into JS memory
        const file = await mediaResultToFile(result)
        if (file) {
          onPickerReturnRef.current([file])
        } else {
          // Result carried no fetchable media — a real failure, not a cancel.
          onPickerReturnRef.current(null)
          onPickerErrorRef.current?.('Couldn’t read the photo. Please try again.')
        }
      } catch (err) {
        if (isCameraCancel(err)) {
          // Quiet cancel — no error, no phantom attachment
          onPickerReturnRef.current(null)
        } else {
          // Real failure (permission denied, conversion error) — surface it
          onPickerReturnRef.current(null)
          const msg = (err as any)?.message
          onPickerErrorRef.current?.(
            msg && /permission/i.test(msg)
              ? 'Camera permission is needed to take a photo. Enable it in your device settings.'
              : 'Couldn’t attach the photo. Please try again.'
          )
        }
      }
    } else {
      // Web/desktop fallback: HTML input with capture attribute
      launchPicker(cameraInputRef)
    }
  }, [])

  const handleChoosePhoto = useCallback(() => {
    launchPicker(photoPickerRef)
  }, [])

  const handleChooseFile = useCallback(() => {
    launchPicker(filePickerRef)
  }, [])

  return (
    <>
      {/* Hidden inputs — camera input is web/desktop fallback only.
          Choose Photo and Choose File always use HTML inputs. */}
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
        <div className="pb-1 pt-0.5">
          {/* Title row: real title + X on the same centerline */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-semibold text-foreground">
              Attach to message
            </p>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 -mr-1 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              aria-label="Close attachment options"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Compact muted limits block */}
          <div className="mb-3 rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-0.5">File limits</p>
            {attachmentLimitLines().map((line) => (
              <p key={line} className="text-[11px] text-muted-foreground/80 leading-snug">
                {line}
              </p>
            ))}
          </div>

          {/* Actions: equal-height full-row targets, uniform muted icon wells */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleTakePhoto}
              className="w-full flex items-center gap-3 px-3 h-14 rounded-xl hover:bg-muted/60 active:bg-muted transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-foreground flex-shrink-0">
                <Camera className="w-5 h-5" />
              </span>
              <span className="flex flex-col min-w-0 leading-tight">
                <span className="text-sm font-medium text-foreground">Take Photo</span>
                <span className="text-xs text-muted-foreground mt-0.5">Use camera to capture a new photo</span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleChoosePhoto}
              className="w-full flex items-center gap-3 px-3 h-14 rounded-xl hover:bg-muted/60 active:bg-muted transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-foreground flex-shrink-0">
                <ImageIcon className="w-5 h-5" />
              </span>
              <span className="flex flex-col min-w-0 leading-tight">
                <span className="text-sm font-medium text-foreground">Choose Photo</span>
                <span className="text-xs text-muted-foreground mt-0.5">Select from photo library</span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleChooseFile}
              className="w-full flex items-center gap-3 px-3 h-14 rounded-xl hover:bg-muted/60 active:bg-muted transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-foreground flex-shrink-0">
                <FileText className="w-5 h-5" />
              </span>
              <span className="flex flex-col min-w-0 leading-tight">
                <span className="text-sm font-medium text-foreground">Choose File</span>
                <span className="text-xs text-muted-foreground mt-0.5">PDF, CSV, image, or video</span>
              </span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
