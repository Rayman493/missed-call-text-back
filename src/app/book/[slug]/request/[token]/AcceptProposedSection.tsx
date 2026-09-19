'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AcceptProposedSection({
  token,
  slug,
  businessName,
  proposedLabel,
}: {
  token: string
  slug: string
  businessName: string
  proposedLabel: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/booking/requests/by-token/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      if (res.ok) {
        router.refresh()
        return
      }
      const json = await res.json().catch(() => ({}))
      if (json.code === 'slot_unavailable') {
        setError('That time is no longer available. Please choose another time below.')
      } else if (json.code === 'availability_unavailable') {
        setError('Availability is temporarily unavailable. Please try again in a moment.')
      } else {
        setError(json.error || 'Could not accept this time. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{businessName} suggested:</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{proposedLabel}</p>
      <button
        onClick={accept}
        disabled={busy}
        className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? 'Accepting…' : 'Accept this time'}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
