'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface ImageMessageProps {
  mediaUrls: string[]
  mediaTypes: string[]
  onImageLoad?: () => void
}

export function ImageMessage({ mediaUrls, mediaTypes, onImageLoad }: ImageMessageProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null)

  if (!mediaUrls || mediaUrls.length === 0) {
    return null
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2">
        {mediaUrls.map((url, index) => (
          <div
            key={index}
            className="relative group cursor-pointer"
            onClick={() => setExpandedImage(url)}
          >
            <img
              src={url}
              alt={`Attachment ${index + 1}`}
              className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity"
              loading="lazy"
              onLoad={() => {
                if (index === mediaUrls.length - 1 && onImageLoad) {
                  onImageLoad()
                }
              }}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg" />
          </div>
        ))}
      </div>

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpandedImage(null)
              }}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={expandedImage}
              alt="Expanded view"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  )
}
