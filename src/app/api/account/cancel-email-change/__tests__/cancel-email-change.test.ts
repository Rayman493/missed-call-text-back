import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const route = readFileSync('src/app/api/account/cancel-email-change/route.ts', 'utf8')
const settings = readFileSync('src/components/SettingsContent.tsx', 'utf8')

describe('cancel-email-change route — security', () => {
  it('authenticates via the SSR session before anything else', () => {
    expect(route).toContain('supabase.auth.getUser()')
    expect(route).toContain("{ status: 401 }")
  })

  it('operates only on the caller identity — no client-supplied target id', () => {
    expect(route).toContain('updateUserById(user.id')
    // no request body / target uid is read at all
    expect(route).not.toMatch(/body\.(user_?[Ii]d|uid|target)/)
    expect(route).not.toContain('request.json()')
  })

  it('rejects cross-origin POSTs (CSRF defense-in-depth on top of SameSite=Lax)', () => {
    expect(route).toContain("request.headers.get('origin')")
    expect(route).toContain('originHost = new URL(origin).host')
    expect(route).toContain('originHost !== host')
    expect(route).toContain("{ status: 403 }")
    expect(route.indexOf("request.headers.get('origin')")).toBeLessThan(route.indexOf('supabase.auth.getUser()'))
  })

  it('re-reads authoritative user state immediately before the admin write', () => {
    const freshIdx = route.indexOf('supabaseAdmin.auth.admin.getUserById')
    const updateIdx = route.indexOf('supabaseAdmin.auth.admin.updateUserById')
    expect(freshIdx).toBeGreaterThan(-1)
    expect(freshIdx).toBeLessThan(updateIdx)
    // pending check uses the fresh read — not the possibly-stale session copy
    expect(route).toContain('const pendingEmail = freshUser.new_email')
    expect(route).toContain('const currentEmail = freshUser.email')
  })

  it('rejects when there is no pending email change', () => {
    expect(route).toContain('No pending email change to cancel')
    expect(route).toContain("{ status: 409 }")
  })

  it('cancels via the admin re-assign of the CURRENT confirmed email', () => {
    expect(route).toContain('email: currentEmail')
    expect(route).toContain('email_confirm: true')
    // never writes auth tables directly — only the supported admin API
    expect(route).not.toMatch(/\.from\(['"](?:auth\.)?users['"]\)/)
    expect(route).not.toContain('email_change')
  })

  it('verifies authoritative auth state before reporting success', () => {
    expect(route).toContain('supabaseAdmin.auth.admin.getUserById')
    expect(route).toContain('verify.user.email !== currentEmail || verify.user.new_email')
    expect(route.indexOf('verify.user.new_email')).toBeLessThan(route.indexOf('ok: true'))
  })

  it('is rate limited per authenticated user', () => {
    expect(route).toContain('authRateLimiter.isAllowed(user.id)')
  })

  it('keeps service-role usage server-only', () => {
    expect(route).toContain("from '@/lib/supabase/admin'")
    expect(route).not.toContain("'use client'")
    // no key material in the source
    expect(route).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/)
  })
})

describe('cancel-email-change — Settings UI', () => {
  it('shows Cancel beside Resend only while a change is pending', () => {
    const banner = settings.slice(
      settings.indexOf('Email Change Pending'),
      settings.indexOf('Email Change Pending') + 2600
    )
    expect(banner).toContain('Resend Confirmation')
    expect(banner).toContain('setShowCancelEmailConfirm(true)')
    expect(banner).toContain('isCancellingEmailChange')
  })

  it('opens a canonical confirmation modal explaining the original email stays active', () => {
    expect(settings).toContain('Cancel email change?')
    expect(settings).toContain('remains your login email')
    expect(settings).toContain('confirmText="Cancel Change"')
  })

  it('refreshes authoritative auth state instead of clearing optimistically', () => {
    const handler = settings.slice(
      settings.indexOf('handleCancelEmailChange = async'),
      settings.indexOf('handleCloseChangeEmailModal')
    )
    expect(handler).toContain("fetch('/api/account/cancel-email-change'")
    expect(handler).toContain('supabase.auth.refreshSession()')
    expect(handler).toContain('supabase.auth.getUser()')
    // failure path returns early without closing the confirm or clearing the banner
    expect(handler.indexOf("return // confirm modal stays open")).toBeLessThan(handler.indexOf('refreshSession'))
    expect(handler).toContain('setPendingNewEmail(')
  })

  it('participates in the settings scroll-lock set', () => {
    expect(settings).toContain('showCancelEmailConfirm')
    expect(settings).toContain('|| showCancelEmailConfirm')
  })
})
