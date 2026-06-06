'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface PhotoModalProps {
  imageUrl: string
  isOpen: boolean
  onClose: () => void
}

export default function PhotoModal({ imageUrl, isOpen, onClose }: PhotoModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
      <div className="relative max-w-5xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white hover:text-slate-300 transition-colors flex items-center gap-2"
        >
          <span className="text-sm">Close</span>
          <X className="w-6 h-6" />
        </button>
        <img
          src={imageUrl}
          alt="Full size photo"
          className="w-full h-full object-contain rounded-lg"
        />
      </div>
    </div>
  )
}
