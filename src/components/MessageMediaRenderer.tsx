'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MessageMedia } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'

const DEBUG = process.env.NODE_ENV === 'development'

interface MessageMediaRendererProps {
  media: MessageMedia[]
  isInbound?: boolean
  onImageLoad?: () => void
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
      const response = await fetch(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      })

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

export default function MessageMediaRenderer({ media, isInbound = false, onImageLoad }: MessageMediaRendererProps) {
  const [expandedMedia, setExpandedMedia] = useState<string | null>(null)
  const [loadedMedia, setLoadedMedia] = useState<Set<string>>(new Set())
  const [failedMedia, setFailedMedia] = useState<Set<string>>(new Set())
  const [hasLoadedFirstImage, setHasLoadedFirstImage] = useState(false)
  const [authenticatedUrls, setAuthenticatedUrls] = useState<Record<string, string>>({})

  // Track blob URLs with a ref to ensure proper cleanup
  const blobUrlsRef = useRef<Set<string>>(new Set())

  // Track in-flight fetches to prevent duplicates
  const fetchingRef = useRef<Set<string>>(new Set())

  // Fetch authenticated URLs for media on mount
  useEffect(() => {
    const fetchUrls = async () => {
      const urlMap: Record<string, string> = {}

      for (const mediaItem of media || []) {
        // Use local preview URLs directly (no auth needed)
        if (mediaItem.isLocalPreview) {
          urlMap[mediaItem.id] = mediaItem.media_url
          continue
        }

        // Only fetch authenticated URLs for non-Supabase URLs
        if (!mediaItem.media_url.includes('supabase.co') && !mediaItem.media_url.includes('/storage/v1')) {
          const blobUrl = await fetchAuthenticatedMedia(
            mediaItem.media_url,
            mediaItem.id,
            blobUrlsRef,
            fetchingRef
          )
          if (blobUrl) {
            urlMap[mediaItem.id] = blobUrl
          }
        } else {
          // Direct URLs (Supabase) can be used immediately
          urlMap[mediaItem.id] = mediaItem.media_url
        }
      }

      setAuthenticatedUrls(urlMap)
    }

    fetchUrls()
  }, [media])

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

  const handleMediaClick = (mediaUrl: string) => {
    setExpandedMedia(mediaUrl)
  }

  const handleCloseExpanded = () => {
    setExpandedMedia(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCloseExpanded()
    }
  }

  const handleImageLoad = (mediaId: string) => {
    setLoadedMedia(prev => new Set(prev).add(mediaId))
    
    // Call onImageLoad callback when first image loads
    if (!hasLoadedFirstImage && onImageLoad) {
      setHasLoadedFirstImage(true)
      // Use requestAnimationFrame to ensure layout has updated
      requestAnimationFrame(() => {
        onImageLoad()
      })
    }
  }

  const handleImageError = (mediaId: string) => {
    setFailedMedia(prev => new Set(prev).add(mediaId))
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
          // Use authenticated URL for Twilio media, direct URL for Supabase
          const mediaUrl = authenticatedUrls[mediaItem.id] || getMediaUrl(mediaItem.media_url)
          const isLoaded = loadedMedia.has(mediaItem.id)
          const isFailed = failedMedia.has(mediaItem.id)

          // Skip rendering if URL is invalid
          if (!mediaUrl) {
            if (DEBUG) console.error('[MessageMediaRenderer] Invalid media URL for item:', {
              mediaId: mediaItem.id,
              mediaUrl: mediaItem.media_url
            })
            return null
          }
          
          if (isImage(mediaItem.mime_type)) {
            return (
              <div key={mediaItem.id} className="relative group overflow-hidden rounded-xl shadow-lg border border-slate-700/50">
                {/* Image */}
                {!isFailed && mediaUrl && (
                  <img
                    src={mediaUrl}
                    alt="Message attachment"
                    className={`
                      cursor-pointer rounded-xl transition-all
                      hover:scale-[1.02] hover:shadow-xl
                      max-w-[85%] md:max-w-[420px] max-h-[500px] md:max-h-[600px] object-contain w-full
                      block
                    `}
                    onClick={() => handleMediaClick(mediaUrl)}
                    onLoad={() => handleImageLoad(mediaItem.id)}
                    onError={() => handleImageError(mediaItem.id)}
                    loading="lazy"
                  />
                )}
                
                {/* Loading skeleton - only show before image loads */}
                {!isLoaded && !isFailed && (
                  <div className="absolute inset-0 aspect-video bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse -z-10" />
                )}
                
                {/* Error state */}
                {isFailed && (
                  <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Image failed to load</p>
                  </div>
                )}
                
                {/* Hover affordance */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl pointer-events-none" />
              </div>
            )
          }

          if (isVideo(mediaItem.mime_type)) {
            return (
              <div key={mediaItem.id} className="relative group overflow-hidden rounded-xl shadow-lg border border-slate-700/50">
                {mediaUrl ? (
                  <video
                    src={mediaUrl}
                    controls
                    className="max-w-[85%] md:max-w-[420px] max-h-[500px] md:max-h-[600px] w-full object-contain bg-black"
                    preload="metadata"
                  />
                ) : (
                  <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Video failed to load</p>
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
              {mediaUrl ? (
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View attachment ({mediaItem.mime_type})
                </a>
              ) : (
                <span className="text-sm text-slate-500 dark:text-slate-400">Attachment unavailable</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Expanded media modal */}
      {expandedMedia && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={handleCloseExpanded}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <button
            onClick={handleCloseExpanded}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10 p-2 hover:bg-white/10 rounded-full"
            aria-label="Close"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={expandedMedia}
            alt="Expanded media"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
