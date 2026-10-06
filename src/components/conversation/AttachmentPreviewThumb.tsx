'use client'

import { useEffect, useState } from 'react'
import { File, FileText, FileSpreadsheet, Video, X } from 'lucide-react'

/**
 * Attachment thumbnail for the conversation composer.
 *
 * Why FileReader instead of URL.createObjectURL: blob: URLs created inside
 * the Capacitor Android WebView are unreliable in <img> (origin/scheme
 * handling differs from desktop Chrome), and calling createObjectURL during
 * render leaks a fresh URL every pass. A data: URL renders identically on
 * web and Capacitor and needs no revoke lifecycle.
 *
 * Non-image files never render through <img> — they get a compact file card.
 * If an image preview fails to decode, it falls back to the same file card,
 * so the browser's broken-image UI is never shown.
 */
export default function AttachmentPreviewThumb({
  file,
  onRemove,
}: {
  file: File
  onRemove: () => void
}) {
  const isImage = file.type.startsWith('image/')
  const [preview, setPreview] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    const reader = new FileReader()
    reader.onload = () => {
      if (!cancelled) setPreview(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => {
      if (!cancelled) setFailed(true)
    }
    reader.readAsDataURL(file)
    return () => {
      cancelled = true
      reader.abort()
    }
  }, [file, isImage])

  const showImage = isImage && !failed && !!preview
  const showSkeleton = isImage && !failed && !preview

  return (
    <div className="relative group">
      {showImage ? (
        <img
          src={preview}
          alt="Preview"
          onError={() => setFailed(true)}
          className="w-16 h-16 object-cover rounded-md border border-border/30 transition-opacity duration-200"
        />
      ) : showSkeleton ? (
        <div
          className="w-16 h-16 rounded-md border border-border/30 bg-muted/50 animate-pulse"
          aria-label="Loading attachment preview"
        />
      ) : (
        <FileCard file={file} />
      )}
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full transition-colors hover:bg-red-600"
        type="button"
        aria-label="Remove attachment"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

function FileCard({ file }: { file: File }) {
  const name = file.name || 'Attachment'
  const display = name.length > 16 ? `${name.slice(0, 13)}…` : name
  const Icon =
    file.type === 'application/pdf' ? FileText
    : file.type === 'text/csv' || name.toLowerCase().endsWith('.csv') ? FileSpreadsheet
    : file.type.startsWith('video/') ? Video
    : File
  return (
    <div className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-md border border-border/30 bg-muted/30 px-1">
      <Icon className="w-6 h-6 text-muted-foreground/70 flex-shrink-0" />
      <span className="text-[9px] leading-tight text-muted-foreground/80 text-center truncate w-full" title={name}>
        {display}
      </span>
    </div>
  )
}
