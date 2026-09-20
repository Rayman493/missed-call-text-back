'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

type PreviewStatus = 'pending' | 'accepted' | 'cancelled' | 'expired' | 'invalid'
type Viewer = { signed_in: boolean; already_member: boolean; is_invite_recipient_user: boolean }
type Preview = { status: PreviewStatus; business_name: string; phone_masked: string; viewer: Viewer }

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const supabase = createBrowserClient()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acceptedName, setAcceptedName] = useState<string | null>(null)

  // member signup form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showSignup, setShowSignup] = useState(false)

  const loadPreview = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await fetch(`/api/team/invite/preview?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('preview failed')
      setPreview(await res.json())
    } catch {
      setLoadError(true)
    }
  }, [token])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  const handleAccept = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/team/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not accept the invite.')
        return
      }
      setAcceptedName(data.business_name)
      try {
        window.localStorage.removeItem('replyflow_business_cache')
      } catch {}
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleMemberSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/team/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'user_exists') {
          setError(data.error)
        } else if (data.account_created) {
          // Identity exists; acceptance failed. Sign them in so the invite
          // page can retry acceptance as an authenticated user.
          await supabase.auth.signInWithPassword({ email, password })
          setError(data.error)
          loadPreview()
        } else {
          setError(data.error || 'Could not create your account.')
        }
        return
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError('Account created. Please sign in to continue.')
        return
      }
      try {
        window.localStorage.removeItem('replyflow_business_cache')
      } catch {}
      setAcceptedName(data.business_name)
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleSwitchAccount = async () => {
    await supabase.auth.signOut()
    setPreview(null)
    loadPreview()
  }

  const signInHref = `/auth?redirect=${encodeURIComponent(`/invite/${token}`)}`

  // ── Render states ──────────────────────────────────────────────
  const card = (children: React.ReactNode) => (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-900/95 border border-slate-700/50 rounded-2xl shadow-xl p-6 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  )

  if (loadError) {
    return card(
      <StateBlock
        title="Couldn't load this invite"
        body="Check your connection and try again."
        action={{ label: 'Try again', onClick: loadPreview }}
      />
    )
  }

  if (!preview) {
    return card(<p className="text-center text-slate-400">Loading invitation…</p>)
  }

  if (acceptedName) {
    return card(
      <StateBlock
        title={`Welcome to ${acceptedName}`}
        body="You now have access to this business in ReplyFlow."
        action={{ label: 'Open ReplyFlow', onClick: () => router.push('/dashboard') }}
        success
      />
    )
  }

  switch (preview.status) {
    case 'invalid':
      return card(
        <StateBlock
          title="This invite link isn't valid"
          body="The link may be incomplete. Ask the person who invited you to send a new invite."
        />
      )
    case 'expired':
      return card(
        <StateBlock
          title="This invite has expired"
          body={`Ask ${preview.business_name} to send you a new invite.`}
        />
      )
    case 'cancelled':
      return card(
        <StateBlock
          title="This invite was cancelled"
          body={`Ask ${preview.business_name} to send you a new invite if this was a mistake.`}
        />
      )
    case 'accepted': {
      if (preview.viewer.already_member || preview.viewer.is_invite_recipient_user) {
        return card(
          <StateBlock
            title="You already have access"
            body={`You're already a member of ${preview.business_name}.`}
            action={{ label: 'Open ReplyFlow', onClick: () => router.push('/dashboard') }}
            success
          />
        )
      }
      return card(
        <StateBlock
          title="This invite was already used"
          body={
            preview.viewer.signed_in
              ? 'It was accepted by a different account. Sign in with the account that accepted it, or ask for a new invite.'
              : 'It was accepted by a different account. Sign in with that account, or ask for a new invite.'
          }
          action={
            preview.viewer.signed_in
              ? { label: 'Switch account', onClick: handleSwitchAccount }
              : { label: 'Sign in', href: signInHref }
          }
        />
      )
    }
    case 'pending': {
      if (preview.viewer.already_member) {
        return card(
          <StateBlock
            title="You already have access"
            body={`You're already a member of ${preview.business_name}.`}
            action={{ label: 'Open ReplyFlow', onClick: () => router.push('/dashboard') }}
            success
          />
        )
      }

      return card(
        <div>
          <h1 className="text-xl font-bold text-white text-center">
            Join {preview.business_name}
          </h1>
          <p className="text-sm text-slate-400 text-center mt-2">
            You've been invited to join this business on ReplyFlow (sent to {preview.phone_masked}).
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {preview.viewer.signed_in ? (
            <div className="mt-6 space-y-3">
              <button
                onClick={handleAccept}
                disabled={busy}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {busy ? 'Joining…' : 'Accept invite'}
              </button>
              <button
                onClick={handleSwitchAccount}
                className="w-full text-center text-sm text-slate-400 hover:text-slate-300"
              >
                Not you? Switch account
              </button>
            </div>
          ) : showSignup ? (
            <form onSubmit={handleMemberSignup} className="mt-6 space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (8+ characters)"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {busy ? 'Creating account…' : 'Create account & join'}
              </button>
              <button
                type="button"
                onClick={() => setShowSignup(false)}
                className="w-full text-center text-sm text-slate-400 hover:text-slate-300"
              >
                Already have an account? Sign in
              </button>
            </form>
          ) : (
            <div className="mt-6 space-y-3">
              <button
                onClick={() => setShowSignup(true)}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
              >
                Create account
              </button>
              <a
                href={signInHref}
                className="block w-full rounded-lg border border-slate-700 px-4 py-2.5 text-center text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Sign in to accept
              </a>
            </div>
          )}
        </div>
      )
    }
  }
}

function StateBlock({
  title,
  body,
  action,
  success,
}: {
  title: string
  body: string
  action?: { label: string; onClick?: () => void; href?: string }
  success?: boolean
}) {
  return (
    <div className="text-center">
      <div
        className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
          success ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-300'
        }`}
      >
        {success ? '✓' : '!'}
      </div>
      <h1 className="text-xl font-bold text-white">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">{body}</p>
      {action &&
        (action.href ? (
          <a
            href={action.href}
            className="mt-6 inline-block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            {action.label}
          </a>
        ) : (
          <button
            onClick={action.onClick}
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            {action.label}
          </button>
        ))}
    </div>
  )
}
