'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { MessageMedia } from '@/lib/types'
import { Capacitor } from '@capacitor/core'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { FileText, FileSpreadsheet, File, Image as ImageIcon, ImageOff } from 'lucide-react'

const DEBUG = process.env.NODE_ENV === 'development'

interface MessageMediaRendererProps {
  media: MessageMedia[]
  isInbound?: boolean
  onImageLoad?: () => void
  // True while the parent message is still sending — shows an understated
  // overlay over each image instead of dimming/replacing the bubble.
  isSendingOverlay?: boolean
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Helper function to get file icon based on MIME type
function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return FileText
  if (mimeType === 'text/csv') return FileSpreadsheet
  return File
}

// Helper function to get file type label
function getFileTypeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'text/csv') return 'CSV'
  return mimeType.split('/')[1]?.toUpperCase() || 'FILE'
}

// Helper function to truncate filename
function truncateFilename(filename: string, maxLength: number = 30): string {
  if (!filename) return 'Attachment'
  if (filename.length <= maxLength) return filename
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return filename.substring(0, maxLength - 3) + '...'
  const ext = filename.substring(dot + 1)
  const nameWithoutExt = filename.substring(0, dot)
  const truncatedName = nameWithoutExt.substring(0, maxLength - ext.length - 4) + '...'
  return truncatedName + '.' + ext
}

// Storage keys (UUIDs, hashes, bucket paths, signed URLs) must never be
// shown as the human-facing attachment name.
function isStorageGarbageName(name: string): boolean {
  if (!name) return true
  const base = name.split('?')[0].split('/').pop() || ''
  if (!base) return true
  // UUID (optionally with extension)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.\w+)?$/i.test(base)) return true
  // Long hex/alphanumeric hash with no word characters/spaces
  if (/^[0-9a-f]{24,}(\.\w{1,5})?$/i.test(base)) return true
  // Anything still containing a scheme or path separators
  if (/:\/\//.test(name) || name.includes('\\')) return true
  return false
}

// Human-facing display name: prefer a meaningful persisted filename, then
// recover the original name embedded in our own signed storage path
// ("<ts>-<rand>-<original>" tail), then a semantic fallback by media type.
// Never surfaces storage internals (UUIDs, bucket paths, JWT, URL tail).
export function getDisplayFilename(mediaItem: MessageMedia): string {
  const raw = mediaItem.filename
  if (raw && !isStorageGarbageName(raw)) {
    return truncateFilename(raw.split('?')[0].split('/').pop() || raw)
  }

  // Recover original filename from our own /api/mms-media/serve?path= URL —
  // the storage key tail is "<timestamp>-<rand>-<originalFileName>".
  try {
    const url = new URL(mediaItem.media_url, 'https://placeholder.local')
    if (url.pathname.endsWith('/api/mms-media/serve')) {
      const storagePath = url.searchParams.get('path')
      const tail = storagePath?.split('/').pop() || ''
      const original = tail.replace(/^\d{10,}-[a-z0-9]+-/i, '')
      if (original && original !== tail && !isStorageGarbageName(original)) {
        return truncateFilename(original)
      }
    }
  } catch { /* malformed URL — fall through */ }

  const mime = mediaItem.mime_type || ''
  if (mime.startsWith('image/')) return 'Photo'
  if (mime.startsWith('video/')) return 'Video'
  if (mime === 'application/pdf') return 'Document.pdf'
  if (mime === 'text/csv') return 'Spreadsheet.csv'
  return 'Attachment'
}

// Helper function to get media URL - use direct URL for Supabase, proxy for Twilio
function getMediaUrl(originalUrl: string): string | null {
  // Guard against empty or invalid URLs
  if (!originalUrl || typeof originalUrl !== 'string' || originalUrl.trim() === '') {
    if (DEBUG) console.error('[MessageMediaRenderer] getMediaUrl called with empty URL')
    return null
  }

  // If it's a blob: URL (local preview), return as-is - no proxy needed
  if (originalUrl.startsWith('blob:')) {
    return originalUrl
  }

  // If it's already a Supabase URL, return as-is (no proxy needed)
  if (originalUrl.includes('supabase.co') || originalUrl.includes('/storage/v1')) {
    return originalUrl
  }
  // If it's already a proxy URL, return as-is
  if (originalUrl.includes('/api/twilio/media')) {
    return originalUrl
  }
  // If it's an MMS media URL, return as-is (will be fetched as blob)
  if (originalUrl.includes('/api/mms-media/serve')) {
    return originalUrl
  }
  // Otherwise, proxy through our API for Twilio URLs
  return `/api/twilio/media?url=${encodeURIComponent(originalUrl)}`
}

// Helper function to fetch authenticated media
async function fetchAuthenticatedMedia(
  mediaUrl: string,
  mediaId: string,
  blobUrlsRef: React.MutableRefObject<Set<string>>,
  fetchingRef: React.MutableRefObject<Set<string>>
): Promise<string | null> {
  const correlationId = `media_${mediaId}_${Date.now()}`

  // Prevent duplicate fetches
  if (fetchingRef.current.has(mediaId)) {
    if (DEBUG) console.log(`[MessageMediaRenderer] ${correlationId} Skipping duplicate fetch for ${mediaId}`)
    return null
  }

  // If it's a blob: URL (local preview), return as-is - no auth needed
  if (mediaUrl.startsWith('blob:')) {
    if (DEBUG) console.log(`[MessageMediaRenderer] ${correlationId} Using local blob URL, no auth needed`)
    return mediaUrl
  }

  // If it's a Supabase URL, return as-is
  if (mediaUrl.includes('supabase.co') || mediaUrl.includes('/storage/v1')) {
    if (DEBUG) console.log(`[MessageMediaRenderer] ${correlationId} Using direct Supabase URL, no auth needed`)
    return mediaUrl
  }

  // Guard against empty URLs
  if (!mediaUrl || mediaUrl.trim() === '') {
    console.error(`[MessageMediaRenderer] ${correlationId} Empty media URL provided`)
    return null
  }

  const supabase = createBrowserClient()
  if (!supabase) {
    return null
  }

  try {
    fetchingRef.current.add(mediaId)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      console.error(`[MessageMediaRenderer] ${correlationId} No session access token available`)
      return null
    }

    // For MMS media URLs, fetch with session auth
    if (mediaUrl.includes('/api/mms-media/serve')) {
      if (DEBUG) console.log(`[MessageMediaRenderer] ${correlationId} Fetching MMS media with session auth`)
      let response = await fetch(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      // 401 recovery: if the MMS media token is expired, attempt exactly
      // ONE recovery via the recover-url endpoint to obtain a fresh
      // authorized URL. This prevents infinite 401 loops while keeping
      // historical attachments viewable after token expiry.
      if (response.status === 401) {
        if (DEBUG) console.log(`[MessageMediaRenderer] ${correlationId} MMS media 401 — attempting token recovery`)
        try {
          const recoverRes = await fetch(`/api/mms-media/recover-url?url=${encodeURIComponent(mediaUrl)}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
          if (recoverRes.ok) {
            const { validUrl } = await recoverRes.json()
            if (validUrl) {
              // Retry the fetch with the fresh URL
              response = await fetch(validUrl, {
                headers: {
                  'Authorization': `Bearer ${session.access_token}`
                }
              })
            }
          }
        } catch (recoverError) {
          console.error(`[MessageMediaRenderer] ${correlationId} MMS media recovery failed:`, recoverError)
        }
      }

      if (!response.ok) {
        console.error(`[MessageMediaRenderer] ${correlationId} MMS media fetch failed with ${response.status}`)
        return null
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      blobUrlsRef.current.add(blobUrl)
      return blobUrl
    }

    // For other URLs (Twilio), use the proxy with session auth
    const proxyUrl = getMediaUrl(mediaUrl)
    if (!proxyUrl) {
      console.error(`[MessageMediaRenderer] ${correlationId} Error: getMediaUrl returned null for:`, mediaUrl)
      return null
    }

    const response = await fetch(proxyUrl, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })

    if (!response.ok) {
      console.error(`[MessageMediaRenderer] ${correlationId} Proxy fetch failed with ${response.status}`)
      return null
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    blobUrlsRef.current.add(blobUrl)
    return blobUrl
  } catch (error) {
    console.error(`[MessageMediaRenderer] ${correlationId} Error fetching authenticated media:`, error)
    return null
  } finally {
    fetchingRef.current.delete(mediaId)
  }
}

export default function MessageMediaRenderer({ media, isInbound = false, onImageLoad, isSendingOverlay = false }: MessageMediaRendererProps) {
  const [expandedMedia, setExpandedMedia] = useState<string | null>(null)
  const [loadedMedia, setLoadedMedia] = useState<Set<string>>(new Set())
  const [failedMedia, setFailedMedia] = useState<Set<string>>(new Set())
  const [hasLoadedFirstImage, setHasLoadedFirstImage] = useState(false)
  const [authenticatedUrls, setAuthenticatedUrls] = useState<Record<string, string>>({})
  // Track which media items still need authenticated URL resolution
  const [resolvingMedia, setResolvingMedia] = useState<Set<string>>(new Set())
  // Track retry attempts per media item
  const [retryCount, setRetryCount] = useState<Record<string, number>>({})
  // Bump per media item on manual retry to remount the <img> so the browser
  // re-attempts the load (an unchanged src will not refire onError).
  const [loadNonces, setLoadNonces] = useState<Record<string, number>>({})

  // Track blob URLs with a ref to ensure proper cleanup
  const blobUrlsRef = useRef<Set<string>>(new Set())

  // Track in-flight fetches to prevent duplicates
  const fetchingRef = useRef<Set<string>>(new Set())

  // Maximum retries before showing terminal failure
  const MAX_RETRIES = 2

  // Stable media fingerprint — prevents unnecessary re-fetches when the
  // `media` array reference changes but the actual content hasn't.
  //
  // ROOT CAUSE of sent-image reload flash: when a conversation refetch
  // occurs (e.g., app resume, background refresh), the API returns
  // messages with NEW `media` array references. The merge function
  // creates new message objects, and `MessageMediaRenderer`'s useEffect
  // (which depended on `[media]`) would fire again, re-fetching blob
  // URLs and changing the image `src`, causing a visible reload flash.
  //
  // FIX: depend on a stable string fingerprint of the media content
  // (IDs + URLs + local-preview flags) instead of the array reference.
  // The fingerprint only changes when the actual media content changes
  // (e.g., a genuinely new image, or a URL update from optimistic to
  // server). Unrelated conversation updates that don't change the media
  // content will NOT trigger a re-fetch.
  const mediaFingerprint = useMemo(() => {
    return (media || [])
      .map(m => `${m.id}:${m.media_url}:${m.isLocalPreview ? '1' : '0'}`)
      .join('|')
  }, [media])

  // Fetch authenticated URLs for media on mount
  useEffect(() => {
    const fetchUrls = async () => {
      const urlMap: Record<string, string> = {}
      const resolvingIds: string[] = []

      for (const mediaItem of media || []) {
        // Use local preview URLs directly (no auth needed)
        if (mediaItem.isLocalPreview) {
          urlMap[mediaItem.id] = mediaItem.media_url
          continue
        }

        // Only fetch authenticated URLs for non-Supabase URLs
        if (!mediaItem.media_url.includes('supabase.co') && !mediaItem.media_url.includes('/storage/v1')) {
          resolvingIds.push(mediaItem.id)
          const blobUrl = await fetchAuthenticatedMedia(
            mediaItem.media_url,
            mediaItem.id,
            blobUrlsRef,
            fetchingRef
          )
          if (blobUrl) {
            urlMap[mediaItem.id] = blobUrl
          }
          // If fetch failed, urlMap won't have an entry — item stays in resolving state for retry
        } else {
          // Direct URLs (Supabase) can be used immediately
          urlMap[mediaItem.id] = mediaItem.media_url
        }
      }

      setAuthenticatedUrls(prev => ({ ...prev, ...urlMap }))
      // Remove successfully resolved items from resolving set
      setResolvingMedia(prev => {
        const next = new Set(prev)
        for (const id of Object.keys(urlMap)) {
          next.delete(id)
        }
        return next
      })
    }

    // Mark items that need resolution before fetching
    const initialResolving = new Set<string>()
    for (const mediaItem of media || []) {
      if (!mediaItem.isLocalPreview &&
          !mediaItem.media_url.includes('supabase.co') &&
          !mediaItem.media_url.includes('/storage/v1')) {
        initialResolving.add(mediaItem.id)
      }
    }
    setResolvingMedia(initialResolving)

    fetchUrls()
  }, [mediaFingerprint])

  // Retry resolution for items that are still resolving (no authenticated URL yet)
  useEffect(() => {
    if (resolvingMedia.size === 0) return

    const retryTimers: ReturnType<typeof setTimeout>[] = []

    for (const mediaId of resolvingMedia) {
      const currentRetries = retryCount[mediaId] || 0
      if (currentRetries >= MAX_RETRIES) continue

      const mediaItem = (media || []).find(m => m.id === mediaId)
      if (!mediaItem) continue

      const timer = setTimeout(async () => {
        const blobUrl = await fetchAuthenticatedMedia(
          mediaItem.media_url,
          mediaItem.id,
          blobUrlsRef,
          fetchingRef
        )
        if (blobUrl) {
          setAuthenticatedUrls(prev => ({ ...prev, [mediaId]: blobUrl }))
          setResolvingMedia(prev => {
            const next = new Set(prev)
            next.delete(mediaId)
            return next
          })
          // Clear any premature failure state — newer success overrides stale error
          setFailedMedia(prev => {
            const next = new Set(prev)
            next.delete(mediaId)
            return next
          })
        } else {
          setRetryCount(prev => ({ ...prev, [mediaId]: (prev[mediaId] || 0) + 1 }))
        }
      }, 2000 * (currentRetries + 1)) // exponential backoff: 2s, 4s

      retryTimers.push(timer)
    }

    return () => {
      retryTimers.forEach(t => clearTimeout(t))
    }
  }, [resolvingMedia, retryCount, mediaFingerprint])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
      blobUrlsRef.current.clear()
    }
  }, [])

  if (!media || media.length === 0) {
    return null
  }

  const isImage = (mimeType: string) => mimeType.startsWith('image/')
  const isVideo = (mimeType: string) => mimeType.startsWith('video/')
  const isDocument = (mimeType: string) => mimeType === 'application/pdf' || mimeType === 'text/csv'

  const handleMediaClick = (mediaUrl: string) => {
    setExpandedMedia(mediaUrl)
  }

  // Native document open: blob: URLs and target=_blank don't work in a
  // Capacitor WebView. For our own signed MMS serve URLs, fetch a fresh
  // authorized URL via the existing recover-url endpoint and open it in the
  // system browser. Web behavior is unchanged (plain anchor navigation).
  const handleAttachmentOpen = async (e: React.MouseEvent, mediaItem: MessageMedia, fallbackUrl: string) => {
    if (!Capacitor.isNativePlatform()) return // let the anchor navigate normally
    if (!mediaItem.media_url.includes('/api/mms-media/serve')) return // not our signed URL
    e.preventDefault()
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      let openUrl = mediaItem.media_url
      const res = await fetch(`/api/mms-media/recover-url?url=${encodeURIComponent(mediaItem.media_url)}`, {
        headers: session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}
      })
      if (res.ok) {
        const { validUrl } = await res.json()
        if (validUrl) openUrl = validUrl
      }
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: openUrl })
    } catch (err) {
      console.error('[MessageMediaRenderer] Native attachment open failed:', err)
      window.open(fallbackUrl, '_blank')
    }
  }

  const handleCloseExpanded = () => {
    setExpandedMedia(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCloseExpanded()
    }
  }

  // Lock body scroll and integrate with the modal back stack so the first
  // Android/system Back closes the fullscreen viewer without navigating away.
  useBodyScrollLock(Boolean(expandedMedia), 'message-media-viewer')
  useModalBackButton({ isOpen: Boolean(expandedMedia), onClose: handleCloseExpanded })

  const handleImageLoad = (mediaId: string) => {
    setLoadedMedia(prev => new Set(prev).add(mediaId))

    // Notify on EVERY media load — each loaded image/video can grow the
    // bubble and invalidate the bottom pin. The parent coalesces multiple
    // calls within the same frame into a single re-anchor.
    if (onImageLoad) {
      if (!hasLoadedFirstImage) setHasLoadedFirstImage(true)
      // Use requestAnimationFrame to ensure layout has updated
      requestAnimationFrame(() => {
        onImageLoad()
      })
    }
  }

  const handleImageError = (mediaId: string) => {
    // The <img> only renders once an effective URL exists (authenticated,
    // direct Supabase, or local blob preview), so an error here is a real
    // load failure — mark it so the compact failure placeholder can show.
    setFailedMedia(prev => new Set(prev).add(mediaId))
  }

  // Manual retry after terminal failure. Reuses the existing resolution
  // pipeline: re-queue auth-required media for resolution (resetting the
  // retry budget) and remount the <img> for direct URLs.
  const handleManualRetry = (mediaItem: MessageMedia) => {
    const id = mediaItem.id
    setFailedMedia(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setLoadedMedia(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setRetryCount(prev => ({ ...prev, [id]: 0 }))
    setLoadNonces(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))

    const needsAuthResolution = !mediaItem.isLocalPreview &&
      !mediaItem.media_url.includes('supabase.co') &&
      !mediaItem.media_url.includes('/storage/v1') &&
      !mediaItem.media_url.startsWith('blob:')

    if (needsAuthResolution) {
      // Clear any stale resolved URL and re-enter the resolution queue; the
      // existing retry effect picks it up now that retryCount is reset.
      setAuthenticatedUrls(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setResolvingMedia(prev => new Set(prev).add(id))
    }
  }

  // Determine grid layout based on media count
  const getGridClass = () => {
    if (media.length === 1) return 'grid-cols-1'
    if (media.length === 2) return 'grid-cols-2'
    return 'grid-cols-2'
  }

  return (
    <>
      <div className={`mt-2 ${media.length > 1 ? 'grid gap-2' + getGridClass() : 'flex flex-col gap-2'}`}>
        {media.map((mediaItem, index) => {
          // Use authenticated URL only — do NOT fall back to getMediaUrl() for auth-required URLs
          // Falling back causes the <img> to load a URL without auth headers, triggering premature onError
          const mediaUrl = authenticatedUrls[mediaItem.id] || null
          const isLoaded = loadedMedia.has(mediaItem.id)
          const isFailed = failedMedia.has(mediaItem.id)
          const isResolving = resolvingMedia.has(mediaItem.id) && !mediaUrl
          const retriesExhausted = (retryCount[mediaItem.id] || 0) >= MAX_RETRIES
          // Terminal failure = the image element errored on a resolved URL,
          // OR authenticated URL resolution exhausted its retry budget. (The
          // previous `isFailed && !mediaUrl` shape could never be true:
          // failedMedia is only set once an authenticated URL exists.)
          const isTerminalFailed = isFailed || (isResolving && retriesExhausted)

          // For local previews and Supabase URLs, getMediaUrl is safe (no auth needed)
          const safeDirectUrl = mediaItem.isLocalPreview ||
            mediaItem.media_url.includes('supabase.co') ||
            mediaItem.media_url.includes('/storage/v1') ||
            mediaItem.media_url.startsWith('blob:')
            ? getMediaUrl(mediaItem.media_url)
            : null
          const effectiveUrl = mediaUrl || safeDirectUrl

          // Skip rendering if URL is invalid and not resolving
          if (!effectiveUrl && !isResolving) {
            if (DEBUG) console.error('[MessageMediaRenderer] Invalid media URL for item:', {
              mediaId: mediaItem.id,
              mediaUrl: mediaItem.media_url
            })
            return null
          }
          
          if (isImage(mediaItem.mime_type)) {
            return (
              <div key={mediaItem.id} className="relative group overflow-hidden rounded-xl shadow-lg border border-slate-700/50">
                {/* Image — only render when effective URL is available.
                    Fades in over the placeholder once decoded to avoid abrupt pop. */}
                {!isTerminalFailed && effectiveUrl && (
                  <img
                    key={`${mediaItem.id}-${loadNonces[mediaItem.id] || 0}`}
                    src={effectiveUrl}
                    alt="Message attachment"
                    className={`
                      cursor-pointer rounded-xl transition-opacity duration-300
                      hover:scale-[1.02] hover:shadow-xl
                      max-w-full md:max-w-[420px] max-h-[500px] md:max-h-[600px] object-contain w-full
                      block
                      ${isLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}
                    `}
                    onClick={() => effectiveUrl && handleMediaClick(effectiveUrl)}
                    onLoad={() => handleImageLoad(mediaItem.id)}
                    onError={() => handleImageError(mediaItem.id)}
                    loading="lazy"
                  />
                )}

                {/* Loading state — subtle shimmer placeholder, stable dimensions.
                    Reserves the expected image area so the thread doesn't jump
                    when the image finishes decoding. */}
                {!isLoaded && !isTerminalFailed && (
                  <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center animate-pulse transition-opacity duration-300">
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                      <ImageIcon className="w-5 h-5 opacity-70" />
                      <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-600 border-t-slate-400 dark:border-t-slate-400 rounded-full animate-spin" />
                    </div>
                  </div>
                )}

                {/* Terminal error state — compact, deliberate placeholder with
                    manual retry wired into the existing resolution pipeline. */}
                {isTerminalFailed && (
                  <button
                    type="button"
                    onClick={() => handleManualRetry(mediaItem)}
                    className="aspect-video w-full bg-slate-100 dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors"
                    aria-label="Retry loading image"
                  >
                    <ImageOff className="w-5 h-5 opacity-70" />
                    <span className="text-xs">Couldn't load image</span>
                    <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Tap to retry</span>
                  </button>
                )}

                {/* Sending overlay — understated, keeps the thumbnail visible
                    while the parent message is in 'sending' state. */}
                {isSendingOverlay && !isTerminalFailed && effectiveUrl && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/25 rounded-xl pointer-events-none">
                    <div className="flex items-center gap-1.5 bg-black/55 px-2.5 py-1 rounded-full text-white text-[10px] font-medium">
                      <div className="animate-spin rounded-full h-2.5 w-2.5 border border-white/40 border-t-white" />
                      Sending…
                    </div>
                  </div>
                )}

                {/* Hover affordance */}
                {effectiveUrl && !isTerminalFailed && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl pointer-events-none" />
                )}
              </div>
            )
          }

          if (isDocument(mediaItem.mime_type)) {
            const FileIcon = getFileIcon(mediaItem.mime_type)
            const displayName = getDisplayFilename(mediaItem)

            return (
              <div key={mediaItem.id} className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
                <FileIcon className="w-8 h-8 text-slate-600 dark:text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {getFileTypeLabel(mediaItem.mime_type)} · {formatFileSize(mediaItem.size || 0)}
                  </p>
                </div>
                {effectiveUrl ? (
                  <a
                    href={effectiveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { void handleAttachmentOpen(e, mediaItem, effectiveUrl) }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                  >
                    Tap to open
                  </a>
                ) : isTerminalFailed ? (
                  <button
                    type="button"
                    onClick={() => handleManualRetry(mediaItem)}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                    aria-label="Retry loading attachment"
                  >
                    Couldn’t load · Retry
                  </button>
                ) : (
                  <span className="text-sm text-slate-400 dark:text-slate-500 flex-shrink-0">
                    Loading…
                  </span>
                )}
              </div>
            )
          }

          if (isVideo(mediaItem.mime_type)) {
            return (
              <div key={mediaItem.id} className="relative group overflow-hidden rounded-xl shadow-lg border border-slate-700/50">
                {effectiveUrl && !isTerminalFailed ? (
                  <video
                    key={`${mediaItem.id}-${loadNonces[mediaItem.id] || 0}`}
                    src={effectiveUrl}
                    controls
                    className="max-w-full md:max-w-[420px] max-h-[500px] md:max-h-[600px] w-full object-contain bg-black"
                    preload="metadata"
                    onLoadedMetadata={() => handleImageLoad(mediaItem.id)}
                    onError={() => handleImageError(mediaItem.id)}
                  />
                ) : isTerminalFailed ? (
                  <button
                    type="button"
                    onClick={() => handleManualRetry(mediaItem)}
                    className="aspect-video w-full bg-slate-100 dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors"
                    aria-label="Retry loading video"
                  >
                    <ImageOff className="w-5 h-5 opacity-70" />
                    <span className="text-xs">Couldn't load video</span>
                    <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Tap to retry</span>
                  </button>
                ) : (
                  <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center animate-pulse">
                    <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-600 border-t-slate-400 dark:border-t-slate-400 rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )
          }

          // Fallback for unsupported media types
          return (
            <div key={mediaItem.id} className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {effectiveUrl ? (
                <a
                  href={effectiveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { void handleAttachmentOpen(e, mediaItem, effectiveUrl) }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View attachment ({getFileTypeLabel(mediaItem.mime_type)})
                </a>
              ) : isTerminalFailed ? (
                <button
                  type="button"
                  onClick={() => handleManualRetry(mediaItem)}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  aria-label="Retry loading attachment"
                >
                  Couldn’t load · Retry
                </button>
              ) : (
                <span className="text-sm text-slate-400 dark:text-slate-500">Loading…</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Expanded media modal — portaled to document.body so an animated
          (transform-containing) ancestor can't trap the fixed overlay and
          leave an undimmed strip at the top of the visual viewport. */}
      {expandedMedia && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 touch-none overflow-hidden"
          onClick={handleCloseExpanded}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <button
            onClick={handleCloseExpanded}
            className="absolute z-10 p-2 text-white hover:text-gray-300 transition-colors hover:bg-white/10 rounded-full"
            style={{ top: 'max(1rem, env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}
            aria-label="Close"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={expandedMedia}
            alt="Expanded media"
            className="max-h-full max-w-full object-contain select-none"
            onClick={(e) => e.stopPropagation()}
            onError={handleCloseExpanded}
          />
        </div>,
        document.body
      )}
    </>
  )
}
