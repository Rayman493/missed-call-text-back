import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const voicemail = readFileSync(join(root, 'src/app/dashboard/personal-voicemail/page.tsx'), 'utf8')
const settings = readFileSync(join(root, 'src/components/SettingsContent.tsx'), 'utf8')
const help = readFileSync(join(root, 'src/components/ReplyFlowAssistant.tsx'), 'utf8')

describe('Personal Voicemail resume lifecycle', () => {
  it('uses one cleaned-up native resume listener with a web fallback', () => {
    expect(voicemail).toContain("App.addListener('appStateChange'")
    expect(voicemail).toContain('if (isActive) handleResume()')
    expect(voicemail).toContain('appStateListener?.remove()')
    expect(voicemail).toContain("document.removeEventListener('visibilitychange', visibilityHandler)")
  })

  it('coalesces concurrent resume and polling fetches', () => {
    expect(voicemail).toContain('if (fetchInFlightRef.current) return fetchInFlightRef.current')
    expect(voicemail).toContain('fetchInFlightRef.current = request')
    expect(voicemail).toContain('fetchInFlightRef.current = null')
  })

  it('performs one controlled auth refresh retry only for resume authorization failures', () => {
    expect(voicemail).toContain("options?.resume && (response.status === 401 || response.status === 403)")
    expect(voicemail).toContain('await supabase.auth.refreshSession()')
    expect(voicemail.match(/fetch\('\/api\/personal-voicemails'/g)).toHaveLength(2)
  })

  it('preserves existing data during refresh and exposes a genuine Retry action', () => {
    expect(voicemail).toContain('const hasExistingData = voicemailsRef.current.length > 0')
    expect(voicemail).toContain('if (hasExistingData) setRefreshing(true)')
    expect(voicemail).toContain('onClick={() => fetchVoicemails()}')
    expect(voicemail).toContain('Retry')
    expect(voicemail).toContain('setError(null)')
  })

  it('deduplicates fetch and realtime data by canonical voicemail id', () => {
    expect(voicemail).toContain('seenIds.has(v.id)')
    expect(voicemail).toContain('prev.some((v) => v.id === voicemailWithUrl.id)')
  })
})

describe('account credential changes', () => {
  it('rejects invalid or mismatched email before invoking Supabase', () => {
    expect(settings).toContain('Email addresses do not match')
    expect(settings).toContain('Invalid email format')
  })

  it('reauthenticates before initiating the canonical email change', () => {
    const handler = settings.slice(settings.indexOf('const handleChangeEmail'), settings.indexOf('const handleResendConfirmation'))
    expect(handler.indexOf('signInWithPassword')).toBeGreaterThan(-1)
    expect(handler.indexOf('updateUser({')).toBeGreaterThan(handler.indexOf('signInWithPassword'))
    expect(handler).toContain('Current password is incorrect')
    expect(handler).toContain('setPendingNewEmail(newEmail)')
    expect(handler).not.toContain('setUser')
  })

  it('restores pending email state and accurately describes pending verification', () => {
    expect(settings).toContain("setPendingNewEmail(((user as any)?.new_email as string | undefined) || null)")
    expect(settings).toContain('Your current login remains active until verification completes.')
    expect(settings).toContain('handleResendConfirmation')
  })

  it('reauthenticates before updating the password and validates confirmation', () => {
    const handler = settings.slice(settings.indexOf('const handleChangePassword'), settings.indexOf('// Google Calendar handlers'))
    expect(handler).toContain('Passwords do not match')
    expect(handler.indexOf('signInWithPassword')).toBeGreaterThan(-1)
    expect(handler.indexOf('updateUser({')).toBeGreaterThan(handler.indexOf('signInWithPassword'))
    expect(handler).toContain("showToast('Password updated', 'success')")
  })

  it('does not offer password-based changes to OAuth-only accounts', () => {
    expect(settings).toContain("const isOAuthOnlyAccount = authProviders.length > 0 && !authProviders.includes('email')")
    expect(settings).toContain('Your password is managed by your sign-in provider.')
    expect(settings).toContain('Your login email is managed by your sign-in provider.')
    expect(settings).toContain('Managed by sign-in provider')
  })
})

describe('Help copy', () => {
  it('labels related articles as Recommended Reading', () => {
    expect(help).toContain('>Recommended Reading</p>')
    expect(help).not.toContain('>Next recommended action</p>')
  })
})
