'use client'

import { useState } from 'react'
import BrandIcon from './BrandIcon'
import { RefreshCw, WifiOff } from 'lucide-react'

interface OfflineScreenProps {
  onRetry?: () => void
  isRetrying?: boolean
}

export default function OfflineScreen({ onRetry, isRetrying = false }: OfflineScreenProps) {
  const [isRetryingLocal, setIsRetryingLocal] = useState(false)

  const handleRetry = () => {
    setIsRetryingLocal(true)
    onRetry?.()
    // Reset retry state after a delay if no callback is provided
    if (!onRetry) {
      setTimeout(() => setIsRetryingLocal(false), 2000)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center">
      <div className="flex flex-col items-center gap-6 max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-2">
          <BrandIcon size={56} />
          <span className="text-2xl font-bold text-white">
            <span className="text-white">ReplyFlow</span>
            <span className="text-blue-400">HQ</span>
          </span>
        </div>

        {/* Offline Icon */}
        <div className="rounded-full bg-slate-800 p-4">
          <WifiOff className="h-12 w-12 text-slate-400" />
        </div>

        {/* Main Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">
            You're offline
          </h1>
          <p className="text-slate-400">
            Check your internet connection and try again.
          </p>
        </div>

        {/* Supporting Text */}
        <p className="text-sm text-slate-500">
          ReplyFlow requires an internet connection to load your latest customers, messages, jobs, and schedule.
        </p>

        {/* Try Again Button */}
        <button
          onClick={handleRetry}
          disabled={isRetrying || isRetryingLocal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-4 w-4 ${isRetrying || isRetryingLocal ? 'animate-spin' : ''}`} />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  )
}
