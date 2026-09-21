'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import BrandIcon from '@/components/BrandIcon'

/**
 * Intentional state for an authenticated user who has no accessible business —
 * e.g., a team member whose access was removed by the business owner.
 * Fail-closed: shows no business data; the only action is signing out.
 */
export default function NoBusinessAccess() {
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 justify-center">
          <BrandIcon size={32} />
          <span className="text-2xl font-bold text-white">
            ReplyFlow<span className="text-blue-400">HQ</span>
          </span>
        </div>
        <div className="space-y-3">
          <h1 className="text-xl font-semibold text-white">
            You no longer have access to this business
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your access may have been removed by the business owner. If you think
            this was a mistake, contact them for a new invitation.
          </p>
        </div>
        <button
          onClick={async () => {
            setSigningOut(true)
            try {
              await signOut()
            } finally {
              setSigningOut(false)
            }
          }}
          disabled={signingOut}
          className="w-full h-12 bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 font-semibold transition-all"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  )
}
