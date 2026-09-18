'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MessageMedia } from '@/lib/types'
import Modal from '@/components/ui/Modal'
import { FileText, FileSpreadsheet, File, Paperclip, X } from 'lucide-react'

// Maximum number of thumbnails to show in the card before "View All"
const PREVIEW_LIMIT = 6

interface CustomerAttachmentsCardProps {
  messages: any[]
}

// Deduplicate by media.id (stable), falling back to media_url+message_id
function dedupeMedia(allMedia: Array<{ media: MessageMedia; message: any }>) {
  const seen = new Set<string>()
  const result: Array<{ media: MessageMedia; message: any }> = []
  for (const item of allMedia) {
    const key = item.media.id || `${item.media.media_url}|${item.message.id}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return FileText
  if (mimeType === 'text/csv') return FileSpreadsheet
  return File
}

function getFileTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'text/csv') return 'CSV'
  return mimeType.split('/')[1]?.toUpperCase() || 'FILE'
}

// Proxy Twilio URLs through our secure media API
function getSecureUrl(originalUrl: string): string {
  if (!originalUrl) return ''
  if (originalUrl.startsWith('blob:')) return originalUrl
  if (originalUrl.includes('supabase.co') || originalUrl.includes('/storage/v1')) return originalUrl
  if (originalUrl.includes('/api/twilio/media')) return originalUrl
  if (originalUrl.includes('/api/mms-media/serve')) return originalUrl
  return `/api/twilio/media?url=${encodeURIComponent(originalUrl)}`
}

export default function CustomerAttachmentsCard({ messages }: CustomerAttachmentsCardProps) {
  const [showAllModal, setShowAllModal] = useState(false)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({})
  const blobUrlsRef = useRef<Record<string, string>>({})
  const [authenticated, setAuthenticated] = useState<Record<string, boolean>>({})
  // Track which display URLs failed to load so we can show a clean file-icon
  // fallback instead of greying out the image (which looks like a disabled state).
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  // Track which original URLs have already attempted a 401 recovery so we
  // never enter an infinite refresh loop (at most one recovery per URL).
  const recoveryAttemptedRef = useRef<Set<string>>(new Set())

  // Collect all media from all messages, newest message first
  const allAttachments = useMemo(() => {
    if (!messages || messages.length === 0) return []
    const collected: Array<{ media: MessageMedia; message: any }> = []
    // Sort messages newest first
    const sorted = [...messages].sort((a, b) => {
      const ta = new Date(a.created_at || a.timestamp || 0).getTime()
      const tb = new Date(b.created_at || b.timestamp || 0).getTime()
      return tb - ta
    })
    for (const msg of sorted) {
      if (msg.media && Array.isArray(msg.media) && msg.media.length > 0) {
        for (const m of msg.media) {
          collected.push({ media: m, message: msg })
        }
      }
      // Also check messageMedia state shape (urls/types from fetchMessageMedia)
      if (msg.media_count && msg.media_count > 0 && msg.media && Array.isArray(msg.media)) {
        // already covered above
      }
    }
    return dedupeMedia(collected)
  }, [messages])

  // Fetch authenticated blob URLs for media that needs auth (Twilio / mms-media)
  useEffect(() => {
    let cancelled = false
    const fetchBlobUrls = async () => {
      const supabase = (await import('@/lib/supabase/browser')).createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      for (const { media } of allAttachments) {
        if (cancelled) return
        const url = media.media_url
        if (!url) continue
        // Only fetch auth for URLs that need it
        if (url.startsWith('blob:') || url.includes('supabase.co') || url.includes('/storage/v1')) {
          continue
        }
        if (authenticated[url] || blobUrlsRef.current[url]) continue
        try {
          const proxyUrl = getSecureUrl(url)
          let res = await fetch(proxyUrl, {
            headers: { Authorization: `Bearer ${token}` }
          })

          // 401 recovery: if the MMS media token is expired, attempt exactly
          // ONE recovery via the recover-url endpoint to obtain a fresh
          // authorized URL. This prevents infinite 401 loops while keeping
          // historical attachments viewable after token expiry.
          if (res.status === 401 && url.includes('/api/mms-media/serve') && !recoveryAttemptedRef.current.has(url)) {
            recoveryAttemptedRef.current.add(url)
            try {
              const recoverRes = await fetch(`/api/mms-media/recover-url?url=${encodeURIComponent(url)}`, {
                headers: { Authorization: `Bearer ${token}` }
              })
              if (recoverRes.ok) {
                const { validUrl } = await recoverRes.json()
                if (validUrl) {
                  // Retry the fetch with the fresh URL
                  res = await fetch(getSecureUrl(validUrl), {
                    headers: { Authorization: `Bearer ${token}` }
                  })
                }
              }
            } catch {
              // recovery failed — fall through to normal failure handling
            }
          }

          if (!res.ok) continue
          const blob = await res.blob()
          const blobUrl = URL.createObjectURL(blob)
          blobUrlsRef.current[url] = blobUrl
          if (!cancelled) {
            setBlobUrls(prev => ({ ...prev, [url]: blobUrl }))
            setAuthenticated(prev => ({ ...prev, [url]: true }))
          }
        } catch {
          // skip this media
        }
      }
    }
    fetchBlobUrls()
    return () => { cancelled = true }
  }, [allAttachments, authenticated])

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(blobUrlsRef.current).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [])

  const getDisplayUrl = (media: MessageMedia): string => {
    const url = media.media_url
    if (!url) return ''
    if (url.startsWith('blob:')) return url
    if (url.includes('supabase.co') || url.includes('/storage/v1')) return url
    if (blobUrls[url]) return blobUrls[url]
    // Return proxy URL as fallback (may not load without auth, but shows something)
    return getSecureUrl(url)
  }

  // Mark a display URL as failed so we show a file-icon fallback.
  const handleImageError = (displayUrl: string) => {
    setFailedImages(prev => {
      if (prev.has(displayUrl)) return prev
      const next = new Set(prev)
      next.add(displayUrl)
      return next
    })
  }

  // Render an image thumbnail or a file-icon fallback if the image failed to load.
  // Using a keyed component ensures error state resets when the display URL changes
  // (e.g. when a blob URL arrives after the initial proxy URL failed).
  const renderThumbnail = (media: MessageMedia, onOpen: () => void) => {
    const displayUrl = getDisplayUrl(media)
    const hasFailed = failedImages.has(displayUrl)

    if (hasFailed || !isImage(media.mime_type)) {
      const Icon = getFileIcon(media.mime_type || 'application/octet-stream')
      return (
        <div
          key={media.id || media.media_url}
          className="aspect-square rounded-lg border border-border/40 bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center justify-center p-2"
        >
          <Icon className="w-6 h-6 text-muted-foreground mb-1" />
          <span className="text-[10px] text-muted-foreground font-medium">
            {getFileTypeLabel(media.mime_type || 'application/octet-stream')}
          </span>
        </div>
      )
    }

    return (
      <button
        key={media.id || media.media_url}
        onClick={onOpen}
        className="aspect-square rounded-lg overflow-hidden border border-border/40 bg-slate-100 dark:bg-slate-800/60 hover:opacity-80 transition-opacity"
      >
        <img
          src={displayUrl}
          alt="Attachment"
          className="w-full h-full object-cover"
          loading="lazy"
          onLoad={() => {
            // Clear any stale failure flag for this URL (e.g. blob URL arrived)
            setFailedImages(prev => {
              if (!prev.has(displayUrl)) return prev
              const next = new Set(prev)
              next.delete(displayUrl)
              return next
            })
          }}
          onError={() => handleImageError(displayUrl)}
        />
      </button>
    )
  }

  // Hide card entirely if no attachments
  if (allAttachments.length === 0) return null

  const previewItems = allAttachments.slice(0, PREVIEW_LIMIT)
  const remainingCount = allAttachments.length - PREVIEW_LIMIT

  return (
    <>
      <div className="bg-muted/30 border border-border/30 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 flex items-center justify-center">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground/90 uppercase tracking-wider">
              Photos & Attachments
            </span>
            <span className="text-xs text-muted-foreground/60">
              {allAttachments.length} {allAttachments.length === 1 ? 'attachment' : 'attachments'}
            </span>
          </div>
          {allAttachments.length > PREVIEW_LIMIT && (
            <button
              onClick={() => setShowAllModal(true)}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              View All
            </button>
          )}
        </div>

        {/* Preview grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {previewItems.map(({ media, message }) =>
            renderThumbnail(media, () => setExpandedImage(getDisplayUrl(media)))
          )}
        </div>

        {/* View All link for mobile (below grid) */}
        {allAttachments.length > PREVIEW_LIMIT && (
          <button
            onClick={() => setShowAllModal(true)}
            className="mt-2 sm:hidden text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            View all {allAttachments.length} attachments
          </button>
        )}
      </div>

      {/* View All Modal */}
      <Modal
        isOpen={showAllModal}
        onClose={() => setShowAllModal(false)}
        title={`Photos & Attachments (${allAttachments.length})`}
        contentMaxHeight="70vh"
      >
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {allAttachments.map(({ media, message }) =>
            renderThumbnail(media, () => {
              setShowAllModal(false)
              setExpandedImage(getDisplayUrl(media))
            })
          )}
        </div>
      </Modal>

      {/* Image Lightbox — portaled to document.body so any transform/filter
          ancestor cannot trap the fixed overlay and leave an undimmed strip
          at the top of the visual viewport. */}
      {expandedImage && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center"
          onClick={() => setExpandedImage(null)}
        >
          <button
            className="absolute z-10 text-white/80 hover:text-white p-2"
            onClick={(e) => { e.stopPropagation(); setExpandedImage(null) }}
            style={{
              top: 'max(1rem, env(safe-area-inset-top))',
              right: 'max(1rem, env(safe-area-inset-right))',
            }}
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={expandedImage}
            alt="Expanded attachment"
            className="max-w-full max-h-full object-contain p-4"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </>
  )
}
