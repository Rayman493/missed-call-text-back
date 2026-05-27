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

  return (
    <>
      <div className="flex flex-col gap-2 mt-2">
        {media.map((mediaItem) => {
          const proxiedUrl = getProxiedMediaUrl(mediaItem.media_url)
          
          if (isImage(mediaItem.mime_type)) {
            return (
              <div key={mediaItem.id} className="relative group">
                <img
                  src={proxiedUrl}
                  alt="Message attachment"
                  className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => handleMediaClick(proxiedUrl)}
                  loading="lazy"
                />
              </div>
            )
          }

          if (isVideo(mediaItem.mime_type)) {
            return (
              <div key={mediaItem.id} className="relative group">
                <video
                  src={proxiedUrl}
                  controls
                  className="max-w-full h-auto rounded-lg"
                  preload="metadata"
                />
              </div>
            )
          }

          // Fallback for unsupported media types
          return (
            <div key={mediaItem.id} className="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
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
        >
          <button
            onClick={handleCloseExpanded}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={expandedMedia}
            alt="Expanded media"
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
