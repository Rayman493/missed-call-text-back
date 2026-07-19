'use client'

import React, { useEffect, useRef, useState } from 'react'
import { X, MessageCircle, CheckCircle } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface BetaFeedbackModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function BetaFeedbackModal({ isOpen, onClose }: BetaFeedbackModalProps) {
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [catOpen, setCatOpen] = useState(false)
  const catButtonRef = useRef<HTMLButtonElement | null>(null)
  const catMenuRef = useRef<HTMLDivElement | null>(null)

  // Lock background scroll when modal is open
  useBodyScrollLock(isOpen)

  // Close category menu on outside click or Escape
  useEffect(() => {
    if (!catOpen) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (catMenuRef.current && !catMenuRef.current.contains(t) && catButtonRef.current && !catButtonRef.current.contains(t)) {
        setCatOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCatOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [catOpen])

  // Android Back closes modal first
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return
    try { window.history.pushState({ rfBetaFeedback: true }, '') } catch {}
    const onPop = () => { onClose() }
    window.addEventListener('popstate', onPop)
    let capListener: { remove: () => void } | undefined
    ;(async () => {
      try {
        const mod = await import('@capacitor/app')
        const { App } = mod as any
        capListener = await App.addListener('backButton', () => onClose())
      } catch {}
    })()
    return () => {
      window.removeEventListener('popstate', onPop)
      capListener?.remove?.()
    }
  }, [isOpen, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!category || !message.trim()) {
      setError('Please select a category and enter your feedback.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/beta-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          message: message.trim(),
          route: window.location.pathname,
          userAgent: navigator.userAgent,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit feedback')
      }

      // Success - clear form and show success message
      setCategory('')
      setMessage('')
      setShowSuccess(true)
      
      // Hide success message after 2 seconds, then close modal
      setTimeout(() => {
        setShowSuccess(false)
        onClose()
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to submit feedback')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200" data-scroll-lock-allow>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border/50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Beta Feedback</h2>
              <p className="text-sm text-muted-foreground">Help us improve ReplyFlow. Report bugs, request features, or share ideas.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            disabled={isSubmitting}
            aria-label="Close feedback modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <p className="text-sm text-muted-foreground mb-6">
            Found a bug or have an idea? We'd love to hear your feedback as we improve ReplyFlow during the beta period.
          </p>

          {/* Success Message */}
          {showSuccess && (
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 mb-6 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-100">Thanks for your feedback!</p>
                <p className="text-xs text-green-300">Your feedback has been sent to the ReplyFlow team.</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category Dropdown */}
            <div className="relative">
              <label className="block text-sm font-medium text-foreground mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <button
                ref={catButtonRef}
                type="button"
                onClick={() => setCatOpen((v) => !v)}
                className="w-full px-3 py-2 bg-muted/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary flex items-center justify-between"
                disabled={isSubmitting}
                aria-haspopup="listbox"
                aria-expanded={catOpen}
              >
                <span className={category ? '' : 'text-muted-foreground'}>
                  {category === 'bug_report' && 'Bug Report'}
                  {category === 'feature_request' && 'Feature Request'}
                  {category === 'general_feedback' && 'General Feedback'}
                  {category === 'other' && 'Other'}
                  {!category && 'Select a category'}
                </span>
                <svg className={`w-4 h-4 transition-transform ${catOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {catOpen && (
                <div
                  ref={catMenuRef}
                  className="absolute z-[100] mt-2 w-full bg-card border border-border/50 rounded-lg shadow-xl max-h-[min(50vh,320px)] overflow-y-auto"
                  role="listbox"
                >
                  {[
                    { value: 'bug_report', label: 'Bug Report' },
                    { value: 'feature_request', label: 'Feature Request' },
                    { value: 'general_feedback', label: 'General Feedback' },
                    { value: 'other', label: 'Other' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setCategory(opt.value); setCatOpen(false) }}
                      className={`w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between ${category === opt.value ? 'text-foreground' : 'text-muted-foreground'}`}
                      role="option"
                      aria-selected={category === opt.value}
                    >
                      <span>{opt.label}</span>
                      {category === opt.value && (
                        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Message Textarea */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-foreground mb-2">
                Your Feedback <span className="text-red-500">*</span>
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 bg-muted/50 border border-border/50 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
                placeholder="Describe your feedback in detail..."
                required
                disabled={isSubmitting}
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck={true}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg transition-colors duration-200"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
