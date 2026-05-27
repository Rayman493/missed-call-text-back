'use client'

import React, { useState } from 'react'
import { MessageMedia } from '@/lib/types'

interface MessageMediaRendererProps {
  media: MessageMedia[]
  isInbound?: boolean
}

// Helper function to convert Twilio media URL to proxy URL
function getProxiedMediaUrl(originalUrl: string): string {
  // If it's already a proxy URL, return as-is
  if (originalUrl.includes('/api/twilio/media')) {
    return originalUrl
  }
  // Otherwise, proxy through our API
  return `/api/twilio/media?url=${encodeURIComponent(originalUrl)}`
}

export default function MessageMediaRenderer({ media, isInbound = false }: MessageMediaRendererProps) {
  const [expandedMedia, setExpandedMedia] = useState<string | null>(null)
  const [loadedMedia, setLoadedMedia] = useState<Set<string>>(new Set())
  const [failedMedia, setFailedMedia] = useState<Set<string>>(new Set())

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
          const proxiedUrl = getProxiedMediaUrl(mediaItem.media_url)
          const isLoaded = loadedMedia.has(mediaItem.id)
          const isFailed = failedMedia.has(mediaItem.id)
          
          if (isImage(mediaItem.mime_type)) {
            return (
              <div key={mediaItem.id} className="relative group">
                {/* Image */}
                {!isFailed && (
                  <img
                    src={proxiedUrl}
                    alt="Message attachment"
                    className={`
                      cursor-pointer rounded-lg transition-all
                      hover:scale-[1.02] hover:shadow-lg
                      max-h-[320px] md:max-h-[420px] object-contain w-full
                      block
                    `}
                    onClick={() => handleMediaClick(proxiedUrl)}
                    onLoad={() => handleImageLoad(mediaItem.id)}
                    onError={() => handleImageError(mediaItem.id)}
                    loading="lazy"
                  />
                )}
                
                {/* Loading skeleton - only show before image loads */}
                {!isLoaded && !isFailed && (
                  <div className="absolute inset-0 aspect-video bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse -z-10" />
                )}
                
                {/* Error state */}
                {isFailed && (
                  <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Image failed to load</p>
                  </div>
                )}
                
                {/* Hover affordance */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg pointer-events-none" />
              </div>
            )
          }

          if (isVideo(mediaItem.mime_type)) {
            return (
              <div key={mediaItem.id} className="relative group">
                <video
                  src={proxiedUrl}
                  controls
                  className="rounded-lg max-h-[320px] md:max-h-[420px] w-full object-contain"
                  preload="metadata"
                />
              </div>
            )
          }

          // Fallback for unsupported media types
          return (
            <div key={mediaItem.id} className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <a
                href={proxiedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View attachment ({mediaItem.mime_type})
              </a>
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
