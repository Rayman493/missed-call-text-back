/**
 * Batch 8 — account deletion completion UX contracts.
 *
 * Production finding: backend deletion fully succeeded (Stripe, Twilio,
 * business, auth user, confirmations) but the browser was stranded on a
 * blank /dashboard/settings. Root cause: auth teardown ran BEFORE
 * navigation — signOut's SIGNED_OUT triggered competing redirects
 * (AuthContext → /auth/signin, BusinessGuard → /onboarding) and unmounted
 * the protected tree, racing/cancelling the trailing router.replace.
 * Fix: replace() to the public /account-deleted route FIRST, teardown after.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../..')
const readSrc = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const SETTINGS = readSrc('src/components/SettingsContent.tsx')
const MIDDLEWARE = readSrc('middleware.ts')
const DELETED_PATH = 'src/app/account-deleted/page.tsx'
const DELETED = existsSync(path.join(repoRoot, DELETED_PATH)) ? readSrc(DELETED_PATH) : ''

const handler = SETTINGS.slice(
  SETTINGS.indexOf('const handleDeleteAccount'),
  SETTINGS.indexOf('// Change email handler'),
)

describe('Public success route /account-deleted', () => {
  it('exists and renders the canonical success copy', () => {
    expect(DELETED).not.toBe('')
    expect(DELETED).toContain('Account successfully deleted')
    expect(DELETED).toContain('Your ReplyFlow account and business data have been deleted')
    expect(DELETED).toContain('Back to sign in')
    expect(DELETED).toContain('/auth?mode=signin')
  })

  it('requires no auth, business, or guard context', () => {
    expect(DELETED).not.toContain('useAuth')
    expect(DELETED).not.toContain('useBusiness')
    expect(DELETED).not.toContain('BusinessGuard')
    expect(DELETED).not.toContain('NoBusinessAccess')
    expect(DELETED).not.toContain('redirect(')
  })

  it('is not a protected route in middleware', () => {
    const protectedList = MIDDLEWARE.slice(
      MIDDLEWARE.indexOf('const protectedRoutes'),
      MIDDLEWARE.indexOf('isProtectedRoute ='),
    )
    expect(protectedList).not.toContain('account-deleted')
  })
})

describe('Success ordering — navigate before teardown', () => {
  it('router.replace to /account-deleted runs BEFORE signOut and storage clear', () => {
    const navIdx = handler.indexOf("router.replace('/account-deleted')")
    const signOutIdx = handler.indexOf('supabase.auth.signOut')
    const clearIdx = handler.indexOf('localStorage.clear()')
    expect(navIdx).toBeGreaterThan(-1)
    expect(navIdx).toBeLessThan(signOutIdx)
    expect(navIdx).toBeLessThan(clearIdx)
  })

  it('uses replace, not push (Back must not return to dead Settings)', () => {
    expect(handler).not.toContain("router.push('/account-deleted')")
    expect(handler).toContain("router.replace('/account-deleted')")
  })

  it('no longer navigates to the /auth/signin redirect-stub', () => {
    expect(handler).not.toContain('/auth/signin')
  })

  it('only reaches success navigation after authoritative ok', () => {
    const guardIdx = handler.indexOf('!response.ok || !result?.ok')
    const navIdx = handler.indexOf("router.replace('/account-deleted')")
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(navIdx)
  })
})

describe('Failure path — no false success', () => {
  it('failed responses show error, keep state, and never navigate', () => {
    const failBlock = handler.slice(
      handler.indexOf('!response.ok || !result?.ok'),
      handler.indexOf("router.replace('/account-deleted')"),
    )
    expect(failBlock).toContain('showToast')
    expect(failBlock).toContain('setIsDeleting(false)')
    expect(failBlock).not.toContain('router.replace')
    expect(failBlock).not.toContain('signOut')
    expect(failBlock).not.toContain('localStorage.clear')
  })

  it('network exceptions show error and do not navigate or clear state', () => {
    const catchBlock = handler.slice(handler.lastIndexOf('} catch'))
    expect(catchBlock).toContain('showToast')
    expect(catchBlock).toContain('setIsDeleting(false)')
    expect(catchBlock).not.toContain('router.replace')
  })

  it('signOut failure is logged, not treated as deletion failure', () => {
    expect(handler).toContain("signOut({ scope: 'local' })")
    expect(handler).toContain('SignOut exception')
  })
})

describe('Removed-member UX separation', () => {
  it('owner deletion does not render NoBusinessAccess', () => {
    expect(SETTINGS).not.toContain('NoBusinessAccess')
  })
})
