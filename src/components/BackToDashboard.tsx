'use client'

import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function BackToDashboard() {
  const { user, loading } = useAuth()
  const [isClient, setIsClient] = useState(false)

  // Ensure component only renders client-side to avoid SSR issues
  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient || loading || !user) {
    return null
  }

  return (
    <div className="mb-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
        Back to Dashboard
      </Link>
    </div>
  )
}
