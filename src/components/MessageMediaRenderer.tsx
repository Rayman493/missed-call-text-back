'use client'

import React, { useState, useEffect } from 'react'
import { MessageMedia } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'

interface MessageMediaRendererProps {
  media: MessageMedia[]
  isInbound?: boolean
  onImageLoad?: () => void
}

// Helper function to get media URL - use direct URL for Supabase, proxy for Twilio
function getMediaUrl(originalUrl: string): string {
  // If it's already a Supabase URL, return as-is (no proxy needed)
  if (originalUrl.includes('supabase.co') || originalUrl.includes('/storage/v1')) {
    return originalUrl
  }
  // If it's already a proxy URL, return as-is
  if (originalUrl.includes('/api/twilio/media')) {
    return originalUrl
  }
  // Otherwise, proxy through our API for Twilio URLs
  return `/api/twilio/media?url=${encodeURIComponent(originalUrl)}`
}

// Helper function to fetch authenticated media for Twilio URLs with one-time recovery
async function fetchAuthenticatedMedia(mediaUrl: string, mediaId: string, recoveryState: 'idle' | 'refreshing' | 'recovered' | 'failed', setRecoveryState: (state: 'idle' | 'refreshing' | 'recovered' | 'failed') => void): Promise<string | null> {
  // If it's a blob: URL (local preview), return as-is - no auth or recovery needed
  if (mediaUrl.startsWith('blob:')) {
    return mediaUrl
  }

  // If it's a Supabase URL, return as-is
  if (mediaUrl.includes('supabase.co') || mediaUrl.includes('/storage/v1')) {
    return mediaUrl
  }

  // Guard against empty URLs
  if (!mediaUrl || mediaUrl.trim() === '') {
    console.error('[MessageMediaRenderer] Empty media URL provided')
    return null
  }

  // If it's a ReplyFlow MMS media URL, try to recover it once if expired
  if (mediaUrl.includes('/api/mms-media/serve')) {
    // Only attempt recovery if we haven't tried yet
    if (recoveryState === 'idle') {
      setRecoveryState('refreshing')
      try {
        const recoveryResponse = await fetch(`/api/mms-media/recover-url?url=${encodeURIComponent(mediaUrl)}`)
        if (recoveryResponse.ok) {
          const recoveryData = await recoveryResponse.json()
          if (recoveryData.validUrl) {
            console.log('[MessageMediaRenderer] Recovered broken media URL:', {
              originalPreview: mediaUrl.substring(0, 50),
              recoveredPreview: recoveryData.validUrl.substring(0, 50)
            })
            setRecoveryState('recovered')
            return recoveryData.validUrl
          }
        }
        setRecoveryState('failed')
      } catch (error) {
        console.error('[MessageMediaRenderer] URL recovery failed:', error)
        setRecoveryState('failed')
      }
    } else if (recoveryState === 'failed') {
      // Already failed to recover, don't try again
      console.log('[MessageMediaRenderer] Skipping recovery for already-failed URL')
      return null
    }
  }

  const supabase = createBrowserClient()
  if (!supabase) {
    return null
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      return null
    }

    const proxyUrl = getMediaUrl(mediaUrl)
    const response = await fetch(proxyUrl, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })

    if (!response.ok) {
      return null
    }

    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('[MessageMediaRenderer] Error fetching authenticated media:', error)
    return null
  }
}

export default function MessageMediaRenderer({ media, isInbound = false, onImageLoad }: MessageMediaRendererProps) {
  const [expandedMedia, setExpandedMedia] = useState<string | null>(null)
  const [loadedMedia, setLoadedMedia] = useState<Set<string>>(new Set())
  const [failedMedia, setFailedMedia] = useState<Set<string>>(new Set())
  const [hasLoadedFirstImage, setHasLoadedFirstImage] = useState(false)
  const [authenticatedUrls, setAuthenticatedUrls] = useState<Record<string, string>>({})
  const [mediaRecoveryState, setMediaRecoveryState] = useState<Record<string, 'idle' | 'refreshing' | 'recovered' | 'failed'>>({})

  // MMS UI attachments loaded

  // Fetch authenticated URLs for Twilio media on mount
  useEffect(() => {
    const fetchUrls = async () => {
      const urlMap: Record<string, string> = {}
      
      for (const mediaItem of media || []) {
        // Use local preview URLs directly (no auth needed)
        if (mediaItem.isLocalPreview) {
          urlMap[mediaItem.id] = mediaItem.media_url
          continue
        }
        
        // Only fetch authenticated URLs for Twilio URLs
        if (!mediaItem.media_url.includes('supabase.co') && !mediaItem.media_url.includes('/storage/v1')) {
          const recoveryState = mediaRecoveryState[mediaItem.id] || 'idle'
          const blobUrl = await fetchAuthenticatedMedia(
            mediaItem.media_url,
            mediaItem.id,
            recoveryState,
            (state) => setMediaRecoveryState(prev => ({ ...prev, [mediaItem.id]: state }))
          )
          if (blobUrl) {
            urlMap[mediaItem.id] = blobUrl
          }
        }
      }
      
      setAuthenticatedUrls(urlMap)
    }

    fetchUrls()
  }, [media])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(authenticatedUrls).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [authenticatedUrls])

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
